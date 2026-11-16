import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import JSZip from 'jszip';
import multer from 'multer';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  PRIMARY_DOMAIN,
  detectEntryHtml,
  detectUnbuiltSourceWarning,
  generateAvailableDomainSuggestions,
  getMimeType,
  promoteCompiledBuildDir,
  safelyExtractZip,
  sanitizeRelativePath,
  shouldIgnoreNonDeployEntry,
  validateStaticFileExtension,
  validateSubdomainSlug,
} from './src/server/security.ts';
import type { ExtractedFile } from './src/server/security.ts';
import { tryAutoBuildSourceProject } from './src/server/zipBuilder.ts';
import { analyzeAndFixSiteWithAI } from './src/server/aiFixer.ts';
import { createStorageProvider } from './src/server/storage.ts';
import {
  addSecurityLog,
  findSiteBySlug,
  findUserSites,
  getStore,
  getUserStorageUsed,
  persistStore,
  recordRealVisit,
} from './src/server/store.ts';
import type {
  AbuseReportRecord,
  AnnouncementRecord,
  DeploymentRecord,
  DeploymentSourceType,
  LocalCredentialRecord,
  SiteRecord,
  UserRecord,
} from './src/server/types.ts';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();
const storage = createStorageProvider();

// Ephemeral HMAC key generated per server boot for preview tokens (never exposed to clients)
const PREVIEW_SECRET = process.env.PREVIEW_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');

interface AuthTokenUser {
  uid: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

interface AuthRequest extends Request {
  authUser?: AuthTokenUser;
  userRecord?: UserRecord;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isBootstrappedAdmin(token: AuthTokenUser): boolean {
  return (
    token.email === BOOTSTRAPPED_ADMIN_EMAIL &&
    token.email_verified === true
  );
}

function createPreviewToken(siteId: string, uid: string): string {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = `${siteId}:${uid}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', PREVIEW_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function verifyPreviewToken(token: string, siteId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return false;
    const [tokSiteId, uid, expStr, sig] = parts;
    if (tokSiteId !== siteId) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expectedSig = crypto
      .createHmac('sha256', PREVIEW_SECRET)
      .update(`${tokSiteId}:${uid}:${expStr}`)
      .digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getCookieValue(req: Request, name: string): string {
  const raw = req.headers.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return '';
}

function extractTokenFromReferer(req: Request): string {
  const ref = req.headers.referer;
  if (typeof ref !== 'string' || !ref) return '';
  try {
    const parsed = new URL(ref);
    return parsed.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

function getLocalSessionSecret(): string {
  return process.env.LOCAL_SESSION_SECRET || getStore().sessionSecret || PREVIEW_SECRET;
}

function hashLocalPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyLocalPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    return derivedBuf.length === expectedBuf.length && crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

function createLocalSessionToken(uid: string, email: string, name: string): string {
  const payload = {
    uid,
    email,
    name,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getLocalSessionSecret())
    .update(payloadB64)
    .digest('hex');
  return `nh_local_${payloadB64}.${sig}`;
}

function verifyLocalSessionToken(token: string): AuthTokenUser | null {
  if (!token.startsWith('nh_local_')) return null;
  const raw = token.slice('nh_local_'.length);
  const dotIdx = raw.indexOf('.');
  if (dotIdx <= 0) return null;
  const payloadB64 = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  if (!payloadB64 || !sig) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getLocalSessionSecret())
      .update(payloadB64)
      .digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      uid?: string;
      email?: string;
      name?: string;
      exp?: number;
    };
    if (!parsed.uid || !parsed.email || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    const store = getStore();
    const userRec = store.users[parsed.uid];
    if (!userRec) return null;

    return {
      uid: parsed.uid,
      email: userRec.email || parsed.email,
      name: userRec.displayName || parsed.name || '',
      email_verified: true,
    };
  } catch {
    return null;
  }
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Autenticação necessária. Faça login para continuar.' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Token de autenticação ausente.' });
    return;
  }

  try {
    const decoded = idToken.startsWith('nh_local_')
      ? verifyLocalSessionToken(idToken)
      : await adminAuth.verifyIdToken(idToken);
    if (!decoded) {
      res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
      return;
    }
    req.authUser = decoded;
    const store = getStore();
    const existing = store.users[decoded.uid];
    if (existing) {
      if (existing.status === 'suspended' && !isBootstrappedAdmin(decoded)) {
        res.status(403).json({
          error: 'Sua conta está suspensa pela administração. Entre em contato com o suporte.',
        });
        return;
      }
      req.userRecord = existing;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }
}

function requireVerifiedEmail(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  if (!req.authUser.email_verified) {
    res.status(403).json({
      error: 'Confirme seu endereço de e-mail antes de criar ou publicar sites.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }
  next();
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Não autenticado.' });
    return;
  }
  const store = getStore();
  const userRec = store.users[req.authUser.uid];
  const allowed =
    isBootstrappedAdmin(req.authUser) ||
    (req.authUser.email_verified === true && userRec?.role === 'admin');
  if (!allowed) {
    addSecurityLog({
      level: 'warning',
      category: 'security',
      uid: req.authUser.uid,
      ip: getClientIp(req),
      message: 'Tentativa não autorizada de acesso ao painel administrativo.',
    });
    res.status(403).json({ error: 'Acesso restrito aos administradores da NovaHospeda.' });
    return;
  }
  next();
}

function renderStatusHtml(title: string, description: string, code: number): string {
  const safeTitle = title.replace(/[<>&"]/g, '');
  const safeDesc = description.replace(/[<>&"]/g, '');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — NovaHospeda</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 480px; width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
    .code { font-family: ui-monospace, monospace; font-size: 13px; color: #64748b; margin-bottom: 12px; }
    h1 { font-size: 22px; margin: 0 0 10px; font-weight: 700; }
    p { font-size: 15px; line-height: 1.6; color: #475569; margin: 0 0 24px; }
    a { display: inline-block; background: #1e40af; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 10px 18px; border-radius: 8px; }
  </style>
</head>
<body>
  <main class="card">
    <div class="code">HTTP ${code} · NovaHospeda (${PRIMARY_DOMAIN})</div>
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    <a href="/">Ir para NovaHospeda</a>
  </main>
</body>
</html>`;
}

function isHtmlPageRequest(filePath: string): boolean {
  const ext = path.posix.extname(filePath).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

function rewriteHtmlForSubpath(html: string, mountPrefix: string): string {
  if (!mountPrefix || mountPrefix === '/') return html;
  const escapedBase = mountPrefix.replace(/"/g, '&quot;');

  // Rewrite root-relative src/href/poster/action attributes (e.g. "/assets/app.js" -> "/sites/slug/assets/app.js")
  let rewritten = html.replace(
    /\b(href|src|poster|data-src)=(["'])\/(?!\/|sites\/|p\/|preview\/)([^"']*)\2/gi,
    (_match, attr: string, quote: string, rest: string) => {
      if (rest.startsWith('#')) {
        return `${attr}=${quote}${mountPrefix}${rest}${quote}`;
      }
      return `${attr}=${quote}${mountPrefix}${rest}${quote}`;
    }
  );

  // Inject <base href="..."> if not already present so relative "./..." and "assets/..." resolve reliably on nested routes
  if (!/<base\b/i.test(rewritten)) {
    if (/<head\b[^>]*>/i.test(rewritten)) {
      rewritten = rewritten.replace(/<head\b[^>]*>/i, (m) => `${m}\n  <base href="${escapedBase}" />`);
    } else {
      rewritten = `<base href="${escapedBase}" />\n${rewritten}`;
    }
  }

  return rewritten;
}

function rewriteCssForSubpath(css: string, mountPrefix: string): string {
  if (!mountPrefix || mountPrefix === '/') return css;
  return css.replace(
    /url\(\s*(["']?)\/(?!\/|sites\/|p\/|preview\/)([^)"']+)\1\s*\)/gi,
    (_match, quote: string, rest: string) => `url(${quote}${mountPrefix}${rest}${quote})`
  );
}

async function serveHostedStaticSite(
  req: Request,
  res: Response,
  site: SiteRecord,
  scope: string,
  subPath: string,
  trackVisit: boolean,
  mountPrefix = '/'
): Promise<void> {
  if (trackVisit && site.status === 'blocked') {
    res
      .status(451)
      .type('text/html; charset=utf-8')
      .send(
        renderStatusHtml(
          'Site bloqueado por violação de política',
          'Este endereço foi suspenso pela moderação da NovaHospeda por violação dos Termos de Uso.',
          451
        )
      );
    return;
  }

  if (trackVisit && site.status === 'suspended') {
    res
      .status(503)
      .type('text/html; charset=utf-8')
      .send(
        renderStatusHtml(
          'Site temporariamente fora do ar',
          'O proprietário pausou temporariamente a publicação deste endereço.',
          503
        )
      );
    return;
  }

  if (!site.currentVersionId && scope === 'live') {
    res
      .status(404)
      .type('text/html; charset=utf-8')
      .send(
        renderStatusHtml(
          'Site aguardando primeira publicação',
          `O projeto "${site.name}" já reservou o subdomínio ${site.slug}.${PRIMARY_DOMAIN}, mas ainda não possui arquivos publicados.`,
          404
        )
      );
    return;
  }

  const rawCleaned = subPath.replace(/^\/+/, '');
  const candidateRel = rawCleaned === '' ? site.entryFile : rawCleaned;
  let safeRel = sanitizeRelativePath(candidateRel);

  let fileBuf: Buffer | null = safeRel ? await storage.readFile(site.id, scope, safeRel) : null;

  // Support clean folder index (e.g. /sobre -> /sobre/index.html)
  if (!fileBuf && safeRel && !path.posix.extname(safeRel)) {
    const folderIndex = `${safeRel}/index.html`;
    const folderBuf = await storage.readFile(site.id, scope, folderIndex);
    if (folderBuf) {
      safeRel = folderIndex;
      fileBuf = folderBuf;
    } else {
      const htmlExt = `${safeRel}.html`;
      const htmlBuf = await storage.readFile(site.id, scope, htmlExt);
      if (htmlBuf) {
        safeRel = htmlExt;
        fileBuf = htmlBuf;
      }
    }
  }

  // SPA fallback: if navigating to a client-side route without an asset extension, serve entryFile if no custom 404 exists
  if (!fileBuf) {
    const custom404 = await storage.readFile(site.id, scope, '404.html');
    const isLikelyPageRoute =
      !rawCleaned ||
      !path.posix.extname(rawCleaned) ||
      rawCleaned.toLowerCase().endsWith('.html');
    const acceptHeader = String(req.headers.accept || '');

    if (!custom404 && isLikelyPageRoute && (acceptHeader.includes('text/html') || !path.posix.extname(rawCleaned))) {
      const fallbackBuf = await storage.readFile(site.id, scope, site.entryFile);
      if (fallbackBuf) {
        safeRel = site.entryFile;
        fileBuf = fallbackBuf;
      }
    }

    if (!fileBuf) {
      if (custom404) {
        res.status(404).type('text/html; charset=utf-8').send(
          mountPrefix !== '/' ? rewriteHtmlForSubpath(custom404.toString('utf8'), mountPrefix) : custom404
        );
        return;
      }
      res
        .status(404)
        .type('text/html; charset=utf-8')
        .send(
          renderStatusHtml(
            'Página não encontrada',
            `O arquivo solicitado não existe em ${site.slug}.${PRIMARY_DOMAIN}.`,
            404
          )
        );
      return;
    }
  }

  // Strict static hosting security headers (never execute user scripts on server)
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; object-src 'none'; base-uri 'self';"
  );

  if (trackVisit && safeRel && isHtmlPageRequest(safeRel)) {
    const referrer = typeof req.headers.referer === 'string' ? req.headers.referer : '';
    const pageUrl = rawCleaned === '' ? '/' : `/${rawCleaned}`;
    recordRealVisit(site.id, pageUrl, referrer);
  }

  const mime = getMimeType(safeRel || 'index.html');
  res.setHeader('Content-Type', mime);

  if (mountPrefix !== '/' && safeRel && isHtmlPageRequest(safeRel)) {
    res.send(rewriteHtmlForSubpath(fileBuf.toString('utf8'), mountPrefix));
    return;
  }
  if (mountPrefix !== '/' && safeRel && safeRel.toLowerCase().endsWith('.css')) {
    res.send(rewriteCssForSubpath(fileBuf.toString('utf8'), mountPrefix));
    return;
  }

  res.send(fileBuf);
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);

  // Initialize store synchronously at boot
  getStore();

  // Optional HTTPS redirect when behind Cloudflare / reverse proxy
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      process.env.FORCE_HTTPS === 'true' &&
      req.headers['x-forwarded-proto'] === 'http'
    ) {
      const host = req.headers.host || PRIMARY_DOMAIN;
      res.redirect(301, `https://${host}${req.originalUrl}`);
      return;
    }
    next();
  });

  // Real subdomain & custom domain routing: nomedosite.nh.com.br or custom CNAME -> serves published static site directly!
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();
    const domainSuffix = `.${PRIMARY_DOMAIN.toLowerCase()}`;
    if (
      hostHeader.endsWith(domainSuffix) &&
      hostHeader !== PRIMARY_DOMAIN.toLowerCase() &&
      hostHeader !== `www.${PRIMARY_DOMAIN.toLowerCase()}`
    ) {
      const slug = hostHeader.slice(0, -domainSuffix.length);
      if (slug && !slug.includes('.')) {
        const site = findSiteBySlug(slug);
        if (!site) {
          res
            .status(404)
            .type('text/html; charset=utf-8')
            .send(
              renderStatusHtml(
                'Subdomínio disponível na NovaHospeda',
                `O endereço ${slug}.${PRIMARY_DOMAIN} ainda não foi publicado. Crie sua conta grátis e publique seu site agora!`,
                404
              )
            );
          return;
        }
        await serveHostedStaticSite(req, res, site, 'live', req.path, true, '/');
        return;
      }
    }

    if (hostHeader) {
      const store = getStore();
      const customMatch = Object.values(store.sites).find(
        (s) => s.customDomain && s.customDomain.toLowerCase() === hostHeader
      );
      if (customMatch) {
        await serveHostedStaticSite(req, res, customMatch, 'live', req.path, true, '/');
        return;
      }
    }
    next();
  });

  // Live immediate public static site routes (work in external browsers and mobile immediately!)
  app.get('/sites/:slug', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.endsWith('/')) {
      next();
      return;
    }
    const slug = String(req.params.slug || '');
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `/sites/${encodeURIComponent(slug)}/${qs}`);
  });

  app.get('/sites/:slug/*', async (req: Request, res: Response) => {
    const slug = String(req.params.slug || '');
    const site = findSiteBySlug(slug);
    if (!site) {
      res
        .status(404)
        .type('text/html; charset=utf-8')
        .send(
          renderStatusHtml(
            'Site não encontrado',
            `Nenhum site publicado foi encontrado para o subdomínio "${slug}.${PRIMARY_DOMAIN}".`,
            404
          )
        );
      return;
    }
    const subPath = (req.params as Record<string, string>)[0] || '';
    const mountPrefix = `/sites/${encodeURIComponent(site.slug)}/`;
    await serveHostedStaticSite(req, res, site, 'live', subPath, true, mountPrefix);
  });

  // Token-in-path preview route: preserves auth across CSS, JS, images, fonts, and subpages on all mobile & iframe browsers
  app.get('/p/:token/:siteId/:scope', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.endsWith('/')) {
      next();
      return;
    }
    const { token, siteId, scope } = req.params;
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(
      302,
      `/p/${encodeURIComponent(token)}/${encodeURIComponent(siteId)}/${encodeURIComponent(scope)}/${qs}`
    );
  });

  app.get('/p/:token/:siteId/:scope/*', async (req: Request, res: Response) => {
    const { token, siteId, scope } = req.params;
    if (!verifyPreviewToken(token, siteId)) {
      res
        .status(403)
        .type('text/html; charset=utf-8')
        .send(
          renderStatusHtml(
            'Pré-visualização expirada ou não autorizada',
            'Gere uma nova pré-visualização a partir do painel ou editor da NovaHospeda.',
            403
          )
        );
      return;
    }
    const store = getStore();
    const site = store.sites[siteId];
    if (!site) {
      res
        .status(404)
        .type('text/html; charset=utf-8')
        .send(renderStatusHtml('Site não encontrado', 'Este projeto não existe ou foi removido.', 404));
      return;
    }
    if (scope === 'draft' && site.currentVersionId) {
      const draftFiles = await storage.listFiles(siteId, 'draft');
      if (draftFiles.length === 0) {
        await storage.copyVersionToDraft(siteId, site.currentVersionId);
      }
    }
    const subPath = (req.params as Record<string, string>)[0] || '';
    const mountPrefix = `/p/${encodeURIComponent(token)}/${encodeURIComponent(siteId)}/${encodeURIComponent(scope)}/`;
    await serveHostedStaticSite(req, res, site, scope, subPath, false, mountPrefix);
  });

  // Legacy query-token preview route (supports cookie + referer token fallback for relative sub-assets)
  app.get('/preview/:siteId/:scope', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.endsWith('/')) {
      next();
      return;
    }
    const { siteId, scope } = req.params;
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(302, `/preview/${encodeURIComponent(siteId)}/${encodeURIComponent(scope)}/${qs}`);
  });

  app.get('/preview/:siteId/:scope/*', async (req: Request, res: Response) => {
    const { siteId, scope } = req.params;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
    const cookieToken = getCookieValue(req, `nh_preview_${siteId}`);
    const refToken = extractTokenFromReferer(req);
    const candidateToken = queryToken || cookieToken || refToken;

    if (!verifyPreviewToken(candidateToken, siteId)) {
      res
        .status(403)
        .type('text/html; charset=utf-8')
        .send(
          renderStatusHtml(
            'Pré-visualização expirada ou não autorizada',
            'Gere uma nova pré-visualização a partir do painel ou editor da NovaHospeda.',
            403
          )
        );
      return;
    }

    if (queryToken) {
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader(
        'Set-Cookie',
        `nh_preview_${siteId}=${encodeURIComponent(queryToken)}; Path=/preview/${encodeURIComponent(siteId)}; HttpOnly; ${
          isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax'
        }`
      );
    }

    const store = getStore();
    const site = store.sites[siteId];
    if (!site) {
      res.status(404).send('Site não encontrado.');
      return;
    }
    if (scope === 'draft' && site.currentVersionId) {
      const draftFiles = await storage.listFiles(siteId, 'draft');
      if (draftFiles.length === 0) {
        await storage.copyVersionToDraft(siteId, site.currentVersionId);
      }
    }
    const subPath = (req.params as Record<string, string>)[0] || '';
    const mountPrefix = `/preview/${encodeURIComponent(siteId)}/${encodeURIComponent(scope)}/`;
    await serveHostedStaticSite(req, res, site, scope, subPath, false, mountPrefix);
  });

  // Body parsing & Rate limiting for API endpoints
  app.use('/api', express.json({ limit: '5mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições em sequência. Aguarde alguns segundos.' },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      addSecurityLog({
        level: 'warning',
        category: 'security',
        uid: null,
        ip: getClientIp(req),
        message: 'Rate limit de upload excedido.',
      });
      res.status(429).json({
        error: 'Limite temporário de uploads atingido. Aguarde alguns minutos e tente novamente.',
      });
    },
  });

  const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de denúncias por hora atingido.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas análises de IA seguidas. Aguarde alguns minutos.' },
  });

  app.use('/api', apiLimiter);

  // Configure dynamic multer upload limit up to 250MB hard ceiling (per-site limit enforced dynamically)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 250 * 1024 * 1024,
      files: 300,
    },
  });

  // --- Public API Routes ---
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', domain: PRIMARY_DOMAIN, storage: storage.driverName });
  });

  app.get('/api/public/info', (req: Request, res: Response) => {
    const store = getStore();
    const proto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0].trim()
        : req.protocol;
    const reqHost = typeof req.headers.host === 'string' ? req.headers.host.trim() : '';
    const origin = reqHost
      ? `${proto}://${reqHost}`
      : process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL
      : 'http://localhost:3000';

    res.json({
      primaryDomain: PRIMARY_DOMAIN,
      appOrigin: origin,
      limits: store.limits,
      announcements: store.announcements.filter((a) => a.active),
      stats: {
        totalPublishedSites: Object.values(store.sites).filter((s) => s.status === 'online' && s.currentVersionId).length,
      },
    });
  });

  app.get('/api/subdomains/check', (req: Request, res: Response) => {
    const raw = typeof req.query.slug === 'string' ? req.query.slug : '';
    const excludeSiteId = typeof req.query.excludeSiteId === 'string' ? req.query.excludeSiteId : '';
    const check = validateSubdomainSlug(raw);
    if (!check.valid) {
      res.json({
        available: false,
        slug: check.slug,
        reason: check.reason,
        fullDomain: check.slug ? `${check.slug}.${PRIMARY_DOMAIN}` : '',
      });
      return;
    }

    const existing = findSiteBySlug(check.slug);
    if (existing && existing.id !== excludeSiteId) {
      res.json({
        available: false,
        slug: check.slug,
        reason: `O endereço ${check.slug}.${PRIMARY_DOMAIN} já está em uso.`,
        fullDomain: `${check.slug}.${PRIMARY_DOMAIN}`,
      });
      return;
    }

    res.json({
      available: true,
      slug: check.slug,
      fullDomain: `${check.slug}.${PRIMARY_DOMAIN}`,
    });
  });

  app.get('/api/subdomains/suggest', (req: Request, res: Response) => {
    const rawName = typeof req.query.name === 'string' ? req.query.name : '';
    const excludeSiteId = typeof req.query.excludeSiteId === 'string' ? req.query.excludeSiteId : '';
    const suggestions = generateAvailableDomainSuggestions(
      rawName,
      (slug) => {
        const existing = findSiteBySlug(slug);
        return Boolean(existing && existing.id !== excludeSiteId);
      },
      PRIMARY_DOMAIN
    );
    res.json({
      primaryDomain: PRIMARY_DOMAIN,
      suggestions,
    });
  });

  app.post('/api/reports', reportLimiter, async (req: Request, res: Response) => {
    const { siteSlug, reason, details, reporterEmail } = req.body || {};
    const cleanSlug = String(siteSlug || '').trim().toLowerCase();
    const cleanReason = String(reason || '').trim();
    const cleanDetails = String(details || '').trim();
    const cleanEmail = String(reporterEmail || '').trim();

    if (!cleanSlug || cleanReason.length < 3 || cleanDetails.length < 10) {
      res.status(400).json({ error: 'Informe o subdomínio, motivo e detalhes da denúncia.' });
      return;
    }

    const store = getStore();
    const matchedSite = findSiteBySlug(cleanSlug);
    const report: AbuseReportRecord = {
      id: crypto.randomUUID(),
      siteSlug: cleanSlug,
      siteId: matchedSite?.id || null,
      reason: cleanReason.slice(0, 120),
      details: cleanDetails.slice(0, 1500),
      reporterEmail: cleanEmail.slice(0, 200),
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };

    store.reports.unshift(report);
    addSecurityLog({
      level: 'warning',
      category: 'security',
      uid: null,
      ip: getClientIp(req),
      message: `Nova denúncia recebida para o subdomínio ${cleanSlug}.${PRIMARY_DOMAIN} (${report.reason}).`,
    });
    await persistStore();

    res.status(201).json({ ok: true, id: report.id });
  });

  // --- Email & Password Auth Routes ---
  app.post('/api/auth/email/register', async (req: Request, res: Response) => {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (rawName.length < 2 || rawName.length > 100) {
      res.status(400).json({ error: 'Informe seu nome completo (mínimo 2 caracteres).' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
      return;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }

    const store = getStore();
    if (!store.limits.allowSignups && rawEmail !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({ error: 'Novos cadastros estão temporariamente pausados pela administração.' });
      return;
    }

    if (!store.localCredentials) {
      store.localCredentials = {};
    }

    if (
      store.localCredentials[rawEmail] ||
      Object.values(store.users).some((u) => u.email.toLowerCase() === rawEmail)
    ) {
      res.status(409).json({
        error: 'Este endereço de e-mail já possui uma conta cadastrada. Faça login para entrar.',
      });
      return;
    }

    const now = new Date().toISOString();
    const uid = `local_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const role = rawEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';

    const credential: LocalCredentialRecord = {
      uid,
      email: rawEmail,
      displayName: rawName,
      passwordHash: hashLocalPassword(rawPassword),
      createdAt: now,
      updatedAt: now,
    };

    const user: UserRecord = {
      uid,
      displayName: rawName,
      email: rawEmail,
      emailVerified: true,
      role,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    store.localCredentials[rawEmail] = credential;
    store.users[uid] = user;

    addSecurityLog({
      level: 'info',
      category: 'auth',
      uid,
      ip: getClientIp(req),
      message: `Nova conta criada com e-mail e senha: ${rawEmail}`,
    });
    await persistStore();

    const token = createLocalSessionToken(uid, rawEmail, rawName);
    res.status(201).json({ token, user, limits: store.limits });
  });

  app.post('/api/auth/email/login', async (req: Request, res: Response) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawEmail || !rawPassword) {
      res.status(400).json({ error: 'Informe seu e-mail e senha.' });
      return;
    }

    const store = getStore();
    const cred = store.localCredentials?.[rawEmail];
    if (!cred || !verifyLocalPassword(rawPassword, cred.passwordHash)) {
      res.status(401).json({ error: 'E-mail ou senha incorretos. Confira seus dados.' });
      return;
    }

    const user = store.users[cred.uid];
    if (!user) {
      res.status(401).json({ error: 'Conta não encontrada.' });
      return;
    }

    if (user.status === 'suspended' && rawEmail !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
      res.status(403).json({
        error: 'Sua conta está suspensa pela administração. Entre em contato com o suporte.',
      });
      return;
    }

    const now = new Date().toISOString();
    user.lastLoginAt = now;
    user.updatedAt = now;
    await persistStore();

    const token = createLocalSessionToken(user.uid, user.email, user.displayName);
    res.json({ token, user, limits: store.limits });
  });

  // --- Authenticated User API Routes ---
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res: Response) => {
    const token = req.authUser!;
    const store = getStore();
    const now = new Date().toISOString();
    const requestedName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim().slice(0, 100)
        : '';

    const existing = store.users[token.uid];
    if (!existing && !store.limits.allowSignups && !isBootstrappedAdmin(token)) {
      res.status(403).json({ error: 'Novos cadastros estão temporariamente pausados pela administração.' });
      return;
    }

    const role =
      isBootstrappedAdmin(token) || existing?.role === 'admin' ? 'admin' : 'user';
    const user: UserRecord = {
      uid: token.uid,
      displayName:
        requestedName ||
        (typeof token.name === 'string' && token.name) ||
        existing?.displayName ||
        (token.email ? token.email.split('@')[0] : 'Usuário'),
      email: token.email || existing?.email || '',
      emailVerified: token.email_verified === true,
      role,
      status: existing?.status || 'active',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastLoginAt: now,
    };

    store.users[token.uid] = user;
    const emailLower = user.email.toLowerCase();
    if (emailLower && store.localCredentials?.[emailLower]) {
      store.localCredentials[emailLower].displayName = user.displayName;
      store.localCredentials[emailLower].updatedAt = now;
    }

    if (!existing) {
      addSecurityLog({
        level: 'info',
        category: 'auth',
        uid: token.uid,
        ip: getClientIp(req),
        message: `Nova conta registrada: ${user.email}`,
      });
    }
    await persistStore();

    res.json({ user, limits: store.limits });
  });

  app.get('/api/me', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const store = getStore();
    const user = store.users[uid];
    const sites = findUserSites(uid);
    const storageUsedBytes = getUserStorageUsed(uid);
    const totalVisits = sites.reduce((sum, s) => sum + (store.analytics[s.id]?.totalVisits || 0), 0);

    res.json({
      user: user || {
        uid,
        displayName: req.authUser!.name || req.authUser!.email || 'Usuário',
        email: req.authUser!.email || '',
        emailVerified: req.authUser!.email_verified === true,
        role: isBootstrappedAdmin(req.authUser!) ? 'admin' : 'user',
        status: 'active',
      },
      limits: store.limits,
      summary: {
        sitesCount: sites.length,
        publishedSitesCount: sites.filter((s) => s.status === 'online' && s.currentVersionId).length,
        storageUsedBytes,
        totalVisits,
      },
    });
  });

  // --- Site Management Routes ---
  app.get('/api/sites', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const store = getStore();
    const sites = findUserSites(uid).map((site) => ({
      ...site,
      totalVisits: store.analytics[site.id]?.totalVisits || 0,
      lastVisitAt: store.analytics[site.id]?.lastVisitAt || null,
      deploymentsCount: (store.deployments[site.id] || []).length,
    }));
    res.json({ sites, limits: store.limits });
  });

  app.post('/api/sites', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const store = getStore();

    if (store.limits.maintenanceMode && !isBootstrappedAdmin(req.authUser!)) {
      res.status(503).json({ error: 'Plataforma em modo de manutenção. Tente novamente em instantes.' });
      return;
    }

    const userSites = findUserSites(uid);
    if (userSites.length >= store.limits.maxSitesPerUser && !isBootstrappedAdmin(req.authUser!)) {
      res.status(403).json({
        error: `Limite do plano gratuito atingido: máximo de ${store.limits.maxSitesPerUser} sites por conta.`,
      });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const rawSlug = String(req.body?.slug || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 80) {
      res.status(400).json({ error: 'O nome do site deve ter entre 2 e 80 caracteres.' });
      return;
    }

    const slugCheck = validateSubdomainSlug(rawSlug);
    if (!slugCheck.valid) {
      res.status(400).json({ error: slugCheck.reason || 'Subdomínio inválido.' });
      return;
    }

    if (findSiteBySlug(slugCheck.slug)) {
      res.status(409).json({ error: `O endereço ${slugCheck.slug}.${PRIMARY_DOMAIN} já está em uso.` });
      return;
    }

    const now = new Date().toISOString();
    const siteId = `site_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const site: SiteRecord = {
      id: siteId,
      ownerId: uid,
      ownerEmail: req.authUser!.email || '',
      name,
      slug: slugCheck.slug,
      customDomain: '',
      status: 'online',
      currentVersionId: null,
      draftVersionId: null,
      versionCount: 0,
      totalSizeBytes: 0,
      fileCount: 0,
      entryFile: 'index.html',
      sslEnabled: true,
      createdAt: now,
      updatedAt: now,
      lastPublishedAt: null,
    };

    store.sites[siteId] = site;
    store.deployments[siteId] = [];
    store.analytics[siteId] = {
      totalVisits: 0,
      dailyVisits: {},
      pageHits: {},
      referrers: {},
      lastVisitAt: null,
    };

    addSecurityLog({
      level: 'info',
      category: 'domain',
      uid,
      ip: getClientIp(req),
      message: `Site criado: ${site.name} (${site.slug}.${PRIMARY_DOMAIN})`,
    });
    await persistStore();

    res.status(201).json({ site });
  });

  app.patch('/api/sites/:siteId', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Este site foi bloqueado pela moderação e não pode ser alterado.' });
      return;
    }

    const { name, slug, status, customDomain } = req.body || {};

    if (typeof name === 'string') {
      const cleanName = name.trim();
      if (cleanName.length < 2 || cleanName.length > 80) {
        res.status(400).json({ error: 'O nome do site deve ter entre 2 e 80 caracteres.' });
        return;
      }
      site.name = cleanName;
    }

    if (typeof slug === 'string') {
      const check = validateSubdomainSlug(slug);
      if (!check.valid) {
        res.status(400).json({ error: check.reason || 'Subdomínio inválido.' });
        return;
      }
      const conflict = findSiteBySlug(check.slug);
      if (conflict && conflict.id !== site.id) {
        res.status(409).json({ error: `O endereço ${check.slug}.${PRIMARY_DOMAIN} já está em uso.` });
        return;
      }
      site.slug = check.slug;
    }

    if (status === 'online' || status === 'suspended') {
      site.status = status;
    }

    if (typeof customDomain === 'string') {
      const cleanDomain = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (cleanDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
        res.status(400).json({ error: 'Informe um domínio próprio válido (ex: www.meudominio.com.br).' });
        return;
      }
      site.customDomain = cleanDomain;
    }

    site.updatedAt = new Date().toISOString();
    await persistStore();

    res.json({ site });
  });

  app.delete('/api/sites/:siteId', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    await storage.deleteSiteStorage(siteId);
    delete store.sites[siteId];
    delete store.deployments[siteId];
    delete store.analytics[siteId];

    addSecurityLog({
      level: 'info',
      category: 'domain',
      uid,
      ip: getClientIp(req),
      message: `Site excluído pelo usuário: ${site.slug}.${PRIMARY_DOMAIN}`,
    });
    await persistStore();

    res.json({ ok: true });
  });

  app.get('/api/sites/:siteId/deployments', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];
    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }
    res.json({ deployments: store.deployments[siteId] || [] });
  });

  // --- Upload & Auto-Publish Pipeline ---
  app.post(
    '/api/sites/:siteId/upload',
    uploadLimiter,
    requireAuth,
    requireVerifiedEmail,
    upload.array('files', 300),
    async (req: AuthRequest, res: Response) => {
      const uid = req.authUser!.uid;
      const { siteId } = req.params;
      const store = getStore();
      const site = store.sites[siteId];

      if (!site || site.ownerId !== uid) {
        res.status(404).json({ error: 'Site não encontrado.' });
        return;
      }

      if (site.status === 'blocked') {
        res.status(403).json({ error: 'Este site foi bloqueado pela administração.' });
        return;
      }

      const uploadedFiles = (req.files as Express.Multer.File[]) || [];
      if (uploadedFiles.length === 0) {
        res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        return;
      }

      const maxSiteBytes = store.limits.maxSiteSizeMb * 1024 * 1024;
      const autoPublish = req.body?.publish !== 'false';
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 240) : '';

      let relativePaths: string[] = [];
      if (typeof req.body?.relativePaths === 'string') {
        try {
          const parsed = JSON.parse(req.body.relativePaths);
          if (Array.isArray(parsed)) relativePaths = parsed.map(String);
        } catch {
          relativePaths = [];
        }
      }

      try {
        let extractedFiles: ExtractedFile[] = [];
        let totalSizeBytes = 0;
        let entryFile = 'index.html';
        let sourceType: DeploymentSourceType = 'files';
        let strippedFolder: string | null = null;
        let sourceOnlyWarning: string | null = null;
        let autoBuilt = false;
        let autoBuildNote: string | null = null;
        let skippedCount = 0;

        const isSingleZip =
          uploadedFiles.length === 1 &&
          (uploadedFiles[0].originalname.toLowerCase().endsWith('.zip') ||
            uploadedFiles[0].mimetype === 'application/zip' ||
            uploadedFiles[0].mimetype === 'application/x-zip-compressed');

        if (isSingleZip) {
          sourceType = 'zip';
          const zipResult = await safelyExtractZip(uploadedFiles[0].buffer, maxSiteBytes);
          extractedFiles = zipResult.files;
          totalSizeBytes = zipResult.totalSizeBytes;
          entryFile = zipResult.entryFile;
          strippedFolder = zipResult.strippedWrapperFolder;
          sourceOnlyWarning = zipResult.sourceOnlyWarning || null;
          autoBuilt = Boolean(zipResult.autoBuilt);
          autoBuildNote = zipResult.autoBuildNote || null;
          skippedCount = zipResult.skippedCount || 0;
        } else {
          const hasZipMixed = uploadedFiles.some((f) => f.originalname.toLowerCase().endsWith('.zip'));
          if (hasZipMixed) {
            res.status(400).json({
              error: 'Envie apenas um arquivo .zip por vez, ou envie arquivos estáticos individuais.',
            });
            return;
          }

          let cumulativeBytes = 0;
          for (let i = 0; i < uploadedFiles.length; i++) {
            const file = uploadedFiles[i];
            const desiredPath = relativePaths[i] || file.originalname;
            if (shouldIgnoreNonDeployEntry(desiredPath) && uploadedFiles.length > 1) {
              skippedCount++;
              continue;
            }
            const safeRel = sanitizeRelativePath(desiredPath);
            if (!safeRel) {
              if (uploadedFiles.length > 1) {
                skippedCount++;
                continue;
              }
              throw new Error(`Nome de arquivo inválido: ${file.originalname}`);
            }
            const extCheck = validateStaticFileExtension(safeRel);
            if (!extCheck.valid) {
              if (uploadedFiles.length > 1) {
                skippedCount++;
                continue;
              }
              throw new Error(extCheck.reason || `Arquivo não permitido: ${safeRel}`);
            }
            cumulativeBytes += file.buffer.byteLength;
            if (cumulativeBytes > maxSiteBytes) {
              throw new Error(
                `Tamanho total excede o limite gratuito de ${store.limits.maxSiteSizeMb} MB por site.`
              );
            }
            extractedFiles.push({ path: safeRel, content: file.buffer });
          }

          if (extractedFiles.length === 0) {
            throw new Error('Nenhum arquivo válido para publicação foi encontrado no envio.');
          }

          const promoted = promoteCompiledBuildDir(extractedFiles);
          extractedFiles = promoted.files;
          if (promoted.promotedDir) {
            strippedFolder = promoted.promotedDir;
          }

          const detected = detectEntryHtml(extractedFiles.map((f) => f.path));
          if (!detected) {
            throw new Error('Inclua pelo menos um arquivo index.html (ou página .html) para publicar o site.');
          }
          entryFile = detected;

          const autoBuild = await tryAutoBuildSourceProject(extractedFiles, entryFile);
          if (autoBuild.built) {
            extractedFiles = autoBuild.files;
            entryFile = autoBuild.entryFile;
            autoBuilt = true;
            autoBuildNote = autoBuild.buildNote || null;
          } else {
            sourceOnlyWarning = detectUnbuiltSourceWarning(extractedFiles, entryFile);
          }

          totalSizeBytes = extractedFiles.reduce((acc, f) => acc + f.content.byteLength, 0);
          sourceType = uploadedFiles.length === 1 && entryFile.endsWith('.html') ? 'html' : 'files';
        }

        const versionNumber = site.versionCount + 1;
        const versionId = `ver_${versionNumber}_${Date.now()}`;

        await storage.writeVersion(site.id, versionId, extractedFiles);
        await storage.copyVersionToDraft(site.id, versionId);

        const now = new Date().toISOString();
        const deployments = store.deployments[site.id] || [];

        if (autoPublish) {
          for (const d of deployments) {
            if (d.status === 'published') d.status = 'archived';
          }
          await storage.promoteVersionToLive(site.id, versionId);
          site.currentVersionId = versionId;
          site.lastPublishedAt = now;
        }

        const deployment: DeploymentRecord = {
          id: versionId,
          siteId: site.id,
          ownerId: uid,
          versionNumber,
          status: autoPublish ? 'published' : 'archived',
          sourceType,
          sizeBytes: totalSizeBytes,
          fileCount: extractedFiles.length,
          entryFile,
          notes:
            notes ||
            (autoBuilt
              ? `ZIP React/Vite compilado automaticamente (${extractedFiles.length} arquivos)`
              : strippedFolder
              ? `ZIP extraído (pasta "${strippedFolder}" normalizada para raiz)`
              : `Upload ${sourceType.toUpperCase()} (${extractedFiles.length} arquivo(s))`),
          createdAt: now,
        };

        deployments.unshift(deployment);
        store.deployments[site.id] = deployments;

        site.draftVersionId = versionId;
        site.versionCount = versionNumber;
        site.totalSizeBytes = totalSizeBytes;
        site.fileCount = extractedFiles.length;
        site.entryFile = entryFile;
        site.updatedAt = now;

        addSecurityLog({
          level: 'info',
          category: 'upload',
          uid,
          ip: getClientIp(req),
          message: `Publicação v${versionNumber} para ${site.slug}.${PRIMARY_DOMAIN} (${extractedFiles.length} arquivos, ${totalSizeBytes} bytes).`,
        });
        await persistStore();

        res.status(201).json({
          site,
          deployment,
          files: extractedFiles.map((f) => ({ path: f.path, sizeBytes: f.content.byteLength })),
          strippedWrapperFolder: strippedFolder,
          sourceOnlyWarning,
          autoBuilt,
          autoBuildNote,
          skippedCount,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao processar arquivos enviados.';
        addSecurityLog({
          level: 'warning',
          category: 'security',
          uid,
          ip: getClientIp(req),
          message: `Upload rejeitado em ${site.slug}: ${message}`,
        });
        res.status(400).json({ error: message });
      }
    }
  );

  // --- Integrated File Manager & Editor Routes ---
  app.get('/api/sites/:siteId/files', requireAuth, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'draft';
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    let files = await storage.listFiles(siteId, scope);
    if (files.length === 0 && scope === 'draft' && site.currentVersionId) {
      await storage.copyVersionToDraft(siteId, site.currentVersionId);
      files = await storage.listFiles(siteId, 'draft');
    }

    res.json({ files, scope });
  });

  app.get('/api/sites/:siteId/file', requireAuth, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const filePath = typeof req.query.path === 'string' ? req.query.path : '';
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'draft';
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    const buf = await storage.readFile(siteId, scope, filePath);
    if (!buf) {
      res.status(404).json({ error: 'Arquivo não encontrado.' });
      return;
    }

    res.json({
      path: filePath,
      content: buf.toString('utf8'),
      sizeBytes: buf.byteLength,
    });
  });

  app.put('/api/sites/:siteId/file', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const { path: rawPath, content } = req.body || {};
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Site bloqueado pela administração.' });
      return;
    }

    const safeRel = sanitizeRelativePath(String(rawPath || ''));
    if (!safeRel) {
      res.status(400).json({ error: 'Caminho de arquivo inválido.' });
      return;
    }

    const extCheck = validateStaticFileExtension(safeRel);
    if (!extCheck.valid) {
      res.status(400).json({ error: extCheck.reason || 'Extensão não permitida.' });
      return;
    }

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Conteúdo do arquivo deve ser texto.' });
      return;
    }

    const buf = Buffer.from(content, 'utf8');
    const maxBytes = store.limits.maxSiteSizeMb * 1024 * 1024;
    const existingFiles = await storage.listFiles(siteId, 'draft');
    const prevSize = existingFiles.find((f) => f.path === safeRel)?.sizeBytes || 0;
    const currentTotal = existingFiles.reduce((sum, f) => sum + f.sizeBytes, 0);
    if (currentTotal - prevSize + buf.byteLength > maxBytes) {
      res.status(400).json({
        error: `Edição excederia o limite de ${store.limits.maxSiteSizeMb} MB do site.`,
      });
      return;
    }

    // Write exact unmodified user code to draft workspace
    await storage.writeDraftFile(siteId, safeRel, buf);
    const updatedFiles = await storage.listFiles(siteId, 'draft');

    res.json({ ok: true, path: safeRel, files: updatedFiles });
  });

  app.delete('/api/sites/:siteId/file', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    const safeRel = sanitizeRelativePath(rawPath);
    if (!safeRel) {
      res.status(400).json({ error: 'Caminho inválido.' });
      return;
    }

    const deleted = await storage.deleteDraftFile(siteId, safeRel);
    if (!deleted) {
      res.status(404).json({ error: 'Arquivo não encontrado no rascunho.' });
      return;
    }

    const updatedFiles = await storage.listFiles(siteId, 'draft');
    res.json({ ok: true, files: updatedFiles });
  });

  app.post('/api/sites/:siteId/publish', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 240) : '';
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Site bloqueado pela administração.' });
      return;
    }

    const draftFiles = await storage.listFiles(siteId, 'draft');
    if (draftFiles.length === 0) {
      res.status(400).json({ error: 'Não há arquivos no rascunho para publicar.' });
      return;
    }

    const entryFile = detectEntryHtml(draftFiles.map((f) => f.path));
    if (!entryFile) {
      res.status(400).json({ error: 'Crie ou envie um arquivo index.html antes de publicar.' });
      return;
    }

    const versionNumber = site.versionCount + 1;
    const versionId = `ver_${versionNumber}_${Date.now()}`;
    const snap = await storage.snapshotDraftAsVersion(siteId, versionId);
    await storage.promoteVersionToLive(siteId, versionId);

    const now = new Date().toISOString();
    const deployments = store.deployments[siteId] || [];
    for (const d of deployments) {
      if (d.status === 'published') d.status = 'archived';
    }

    const deployment: DeploymentRecord = {
      id: versionId,
      siteId,
      ownerId: uid,
      versionNumber,
      status: 'published',
      sourceType: 'editor',
      sizeBytes: snap.totalSizeBytes,
      fileCount: snap.fileCount,
      entryFile,
      notes: notes || `Publicação via editor v${versionNumber}`,
      createdAt: now,
    };

    deployments.unshift(deployment);
    store.deployments[siteId] = deployments;

    site.currentVersionId = versionId;
    site.draftVersionId = versionId;
    site.versionCount = versionNumber;
    site.totalSizeBytes = snap.totalSizeBytes;
    site.fileCount = snap.fileCount;
    site.entryFile = entryFile;
    site.lastPublishedAt = now;
    site.updatedAt = now;

    await persistStore();
    res.json({ site, deployment });
  });

  app.post('/api/sites/:siteId/rollback/:versionId', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId, versionId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Site bloqueado pela administração.' });
      return;
    }

    const deployments = store.deployments[siteId] || [];
    const target = deployments.find((d) => d.id === versionId && d.status !== 'removed');
    if (!target) {
      res.status(404).json({ error: 'Versão solicitada não encontrada.' });
      return;
    }

    await storage.promoteVersionToLive(siteId, versionId);
    await storage.copyVersionToDraft(siteId, versionId);

    for (const d of deployments) {
      if (d.status === 'published') d.status = 'archived';
    }
    target.status = 'published';

    const now = new Date().toISOString();
    site.currentVersionId = versionId;
    site.totalSizeBytes = target.sizeBytes;
    site.fileCount = target.fileCount;
    site.entryFile = target.entryFile;
    site.lastPublishedAt = now;
    site.updatedAt = now;

    await persistStore();
    res.json({ site, deployment: target });
  });

  app.get('/api/sites/:siteId/preview-token', requireAuth, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];
    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }
    let draftFiles = await storage.listFiles(siteId, 'draft');
    if (draftFiles.length === 0 && site.currentVersionId) {
      await storage.copyVersionToDraft(siteId, site.currentVersionId);
      draftFiles = await storage.listFiles(siteId, 'draft');
    }
    const token = createPreviewToken(siteId, uid);
    res.json({
      token,
      previewPath: `/p/${encodeURIComponent(token)}/${siteId}/draft/`,
      hasDraftFiles: draftFiles.length > 0,
      hasLiveFiles: Boolean(site.currentVersionId),
    });
  });

  // Create clean starter files for a new site so user can preview and edit right away
  app.post('/api/sites/:siteId/starter', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Site bloqueado pela administração.' });
      return;
    }

    const safeTitle = site.name.replace(/[<>&"]/g, '');
    const starterFiles: ExtractedFile[] = [
      {
        path: 'index.html',
        content: Buffer.from(
          `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${safeTitle}</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <main class="container">\n    <h1>${safeTitle}</h1>\n    <p>Site criado na NovaHospeda em <strong>${site.slug}.${PRIMARY_DOMAIN}</strong>.</p>\n    <button id="acao-btn" type="button">Testar interação</button>\n    <p id="status-msg"></p>\n  </main>\n  <script src="app.js"></script>\n</body>\n</html>\n`,
          'utf8'
        ),
      },
      {
        path: 'style.css',
        content: Buffer.from(
          `* { box-sizing: border-box; }\nbody {\n  margin: 0;\n  font-family: system-ui, -apple-system, sans-serif;\n  background: #f8fafc;\n  color: #0f172a;\n  min-height: 100vh;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n}\n.container {\n  max-width: 560px;\n  width: 100%;\n  background: #ffffff;\n  border: 1px solid #e2e8f0;\n  border-radius: 12px;\n  padding: 32px;\n}\nh1 { margin: 0 0 12px; font-size: 28px; }\np { color: #475569; line-height: 1.6; }\nbutton {\n  margin-top: 12px;\n  background: #1d4ed8;\n  color: #fff;\n  border: 0;\n  border-radius: 8px;\n  padding: 10px 18px;\n  font-weight: 600;\n  cursor: pointer;\n}\nbutton:hover { background: #1e40af; }\n`,
          'utf8'
        ),
      },
      {
        path: 'app.js',
        content: Buffer.from(
          `document.getElementById('acao-btn')?.addEventListener('click', () => {\n  const msg = document.getElementById('status-msg');\n  if (msg) {\n    msg.textContent = 'Interação funcionando perfeitamente!';\n  }\n});\n`,
          'utf8'
        ),
      },
    ];

    for (const file of starterFiles) {
      await storage.writeDraftFile(siteId, file.path, file.content);
    }

    const files = await storage.listFiles(siteId, 'draft');
    res.status(201).json({ files });
  });

  // Export clean Netlify-ready static site ZIP (with index.html at root)
  app.get('/api/sites/:siteId/export-zip', requireAuth, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    const requestedScope = req.query.scope === 'draft' ? 'draft' : req.query.scope === 'live' ? 'live' : null;
    let targetScope: 'live' | 'draft' = requestedScope || (site.currentVersionId ? 'live' : 'draft');

    let files = await storage.listFiles(siteId, targetScope);
    if (files.length === 0 && targetScope === 'live') {
      targetScope = 'draft';
      files = await storage.listFiles(siteId, 'draft');
    } else if (files.length === 0 && targetScope === 'draft' && site.currentVersionId) {
      targetScope = 'live';
      files = await storage.listFiles(siteId, 'live');
    }

    if (files.length === 0) {
      res.status(400).json({
        error: 'Este site ainda não possui arquivos para exportar. Envie seus arquivos ou gere a página inicial primeiro.',
      });
      return;
    }

    const zip = new JSZip();
    for (const f of files) {
      const buf = await storage.readFile(siteId, targetScope, f.path);
      if (buf) {
        zip.file(f.path, buf);
      }
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const downloadName = `${site.slug}-netlify.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', String(zipBuffer.byteLength));
    res.send(zipBuffer);
  });

  // AI Site Error Diagnostic & Fix Proposal
  app.post('/api/sites/:siteId/ai-fix', aiLimiter, requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const userPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.slice(0, 1000) : '';
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    let draftFiles = await storage.listFiles(siteId, 'draft');
    if (draftFiles.length === 0 && site.currentVersionId) {
      await storage.copyVersionToDraft(siteId, site.currentVersionId);
      draftFiles = await storage.listFiles(siteId, 'draft');
    }

    const textFiles = draftFiles.filter((f) => f.isText);
    if (textFiles.length === 0) {
      res.status(400).json({ error: 'Este site ainda não possui arquivos HTML, CSS ou JS para analisar.' });
      return;
    }

    const loadedFiles = [];
    for (const f of textFiles) {
      const buf = await storage.readFile(siteId, 'draft', f.path);
      if (buf) {
        loadedFiles.push({ path: f.path, content: buf.toString('utf8') });
      }
    }

    try {
      const result = await analyzeAndFixSiteWithAI({
        siteName: site.name,
        files: loadedFiles,
        userPrompt,
      });

      // Validate all returned patch file paths against security rules
      const safePatches = result.patches.filter((p) => {
        const clean = sanitizeRelativePath(p.path);
        if (!clean) return false;
        return validateStaticFileExtension(clean).valid;
      }).map((p) => ({
        ...p,
        path: sanitizeRelativePath(p.path)!,
      }));

      addSecurityLog({
        level: 'info',
        category: 'upload',
        uid,
        ip: getClientIp(req),
        message: `Análise de IA executada em ${site.slug}.${PRIMARY_DOMAIN} (${safePatches.length} correção(ões) sugerida(s)).`,
      });

      res.json({
        summary: result.summary,
        diagnostics: result.diagnostics,
        patches: safePatches,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao executar análise com IA.';
      res.status(500).json({ error: msg });
    }
  });

  // Apply approved AI patches to site draft (never modifies live site without user preview/publish)
  app.post('/api/sites/:siteId/ai-apply', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const patches = Array.isArray(req.body?.patches) ? req.body.patches : [];
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || site.ownerId !== uid) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    if (site.status === 'blocked') {
      res.status(403).json({ error: 'Site bloqueado pela administração.' });
      return;
    }

    if (patches.length === 0) {
      res.status(400).json({ error: 'Nenhuma correção selecionada para aplicar.' });
      return;
    }

    const appliedPaths: string[] = [];
    for (const patch of patches) {
      const safeRel = sanitizeRelativePath(String(patch?.path || ''));
      if (!safeRel) continue;
      if (!validateStaticFileExtension(safeRel).valid) continue;
      if (typeof patch?.fixedContent !== 'string') continue;

      const buf = Buffer.from(patch.fixedContent, 'utf8');
      await storage.writeDraftFile(siteId, safeRel, buf);
      appliedPaths.push(safeRel);
    }

    const updatedFiles = await storage.listFiles(siteId, 'draft');
    res.json({ ok: true, appliedPaths, files: updatedFiles });
  });

  // --- Real Analytics Routes ---
  app.get('/api/sites/:siteId/analytics', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const { siteId } = req.params;
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
    const store = getStore();
    const site = store.sites[siteId];

    if (!site || (site.ownerId !== uid && !isBootstrappedAdmin(req.authUser!))) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }

    const record = store.analytics[siteId] || {
      totalVisits: 0,
      dailyVisits: {},
      pageHits: {},
      referrers: {},
      lastVisitAt: null,
    };

    const dailySeries: Array<{ date: string; visits: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailySeries.push({ date: d, visits: record.dailyVisits[d] || 0 });
    }

    const topPages = Object.entries(record.pageHits)
      .map(([page, hits]) => ({ page, hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    const topReferrers = Object.entries(record.referrers)
      .map(([source, hits]) => ({ source, hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    res.json({
      totalVisits: record.totalVisits,
      lastVisitAt: record.lastVisitAt,
      dailySeries,
      topPages,
      topReferrers,
    });
  });

  app.get('/api/analytics/overview', requireAuth, (req: AuthRequest, res: Response) => {
    const uid = req.authUser!.uid;
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 14));
    const store = getStore();
    const userSites = findUserSites(uid);

    const dailyTotals: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      dailyTotals[d] = 0;
    }

    let totalVisits = 0;
    const topSites = userSites.map((site) => {
      const stats = store.analytics[site.id];
      const siteVisits = stats?.totalVisits || 0;
      totalVisits += siteVisits;
      if (stats) {
        for (const dayKey of Object.keys(dailyTotals)) {
          dailyTotals[dayKey] += stats.dailyVisits[dayKey] || 0;
        }
      }
      return {
        id: site.id,
        name: site.name,
        slug: site.slug,
        visits: siteVisits,
        sizeBytes: site.totalSizeBytes,
        status: site.status,
      };
    }).sort((a, b) => b.visits - a.visits);

    const dailySeries = Object.entries(dailyTotals).map(([date, visits]) => ({ date, visits }));

    res.json({
      totalVisits,
      totalStorageBytes: getUserStorageUsed(uid),
      sitesCount: userSites.length,
      dailySeries,
      topSites,
    });
  });

  // --- Admin Panel Routes ---
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
    const store = getStore();
    const diskUsageBytes = await storage.getDiskUsageBytes();
    const mem = process.memoryUsage();

    const users = Object.values(store.users).map((u) => {
      const sites = findUserSites(u.uid);
      return {
        ...u,
        sitesCount: sites.length,
        storageUsedBytes: sites.reduce((sum, s) => sum + s.totalSizeBytes, 0),
      };
    });

    const sites = Object.values(store.sites).map((s) => ({
      ...s,
      totalVisits: store.analytics[s.id]?.totalVisits || 0,
      deploymentsCount: (store.deployments[s.id] || []).length,
    }));

    const totalVisitsAll = sites.reduce((sum, s) => sum + s.totalVisits, 0);

    res.json({
      users,
      sites,
      reports: store.reports,
      announcements: store.announcements,
      securityLogs: store.securityLogs.slice(0, 120),
      limits: store.limits,
      infrastructure: {
        storageDriver: storage.driverName,
        diskUsageBytes,
        heapUsedBytes: mem.heapUsed,
        rssBytes: mem.rss,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        totalVisitsAll,
      },
    });
  });

  app.post('/api/admin/users/:uid/status', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const targetUid = req.params.uid;
    const status = req.body?.status === 'suspended' ? 'suspended' : 'active';
    const store = getStore();
    const target = store.users[targetUid];
    if (!target) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    if (target.email === BOOTSTRAPPED_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Não é possível suspender o administrador principal.' });
      return;
    }
    target.status = status;
    target.updatedAt = new Date().toISOString();
    addSecurityLog({
      level: status === 'suspended' ? 'warning' : 'info',
      category: 'admin',
      uid: req.authUser!.uid,
      ip: getClientIp(req),
      message: `Admin alterou status do usuário ${target.email} para ${status}.`,
    });
    await persistStore();
    res.json({ user: target });
  });

  app.post('/api/admin/sites/:siteId/status', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const status = req.body?.status;
    if (status !== 'online' && status !== 'suspended' && status !== 'blocked') {
      res.status(400).json({ error: 'Status inválido.' });
      return;
    }
    const store = getStore();
    const site = store.sites[siteId];
    if (!site) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }
    site.status = status;
    site.updatedAt = new Date().toISOString();
    addSecurityLog({
      level: status === 'blocked' ? 'critical' : 'info',
      category: 'admin',
      uid: req.authUser!.uid,
      ip: getClientIp(req),
      message: `Admin definiu site ${site.slug}.${PRIMARY_DOMAIN} como "${status}".`,
    });
    await persistStore();
    res.json({ site });
  });

  app.delete('/api/admin/sites/:siteId', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { siteId } = req.params;
    const store = getStore();
    const site = store.sites[siteId];
    if (!site) {
      res.status(404).json({ error: 'Site não encontrado.' });
      return;
    }
    await storage.deleteSiteStorage(siteId);
    delete store.sites[siteId];
    delete store.deployments[siteId];
    delete store.analytics[siteId];
    addSecurityLog({
      level: 'critical',
      category: 'admin',
      uid: req.authUser!.uid,
      ip: getClientIp(req),
      message: `Admin removeu permanentemente o site ${site.slug}.${PRIMARY_DOMAIN}.`,
    });
    await persistStore();
    res.json({ ok: true });
  });

  app.put('/api/admin/limits', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const store = getStore();
    const { maxSitesPerUser, maxSiteSizeMb, allowSignups, maintenanceMode } = req.body || {};

    if (typeof maxSitesPerUser === 'number' && maxSitesPerUser >= 1 && maxSitesPerUser <= 100) {
      store.limits.maxSitesPerUser = Math.floor(maxSitesPerUser);
    }
    if (typeof maxSiteSizeMb === 'number' && maxSiteSizeMb >= 1 && maxSiteSizeMb <= 2048) {
      store.limits.maxSiteSizeMb = Math.floor(maxSiteSizeMb);
    }
    if (typeof allowSignups === 'boolean') {
      store.limits.allowSignups = allowSignups;
    }
    if (typeof maintenanceMode === 'boolean') {
      store.limits.maintenanceMode = maintenanceMode;
    }
    store.limits.updatedAt = new Date().toISOString();

    addSecurityLog({
      level: 'info',
      category: 'admin',
      uid: req.authUser!.uid,
      ip: getClientIp(req),
      message: `Limites atualizados: ${store.limits.maxSitesPerUser} sites/usuário, ${store.limits.maxSiteSizeMb} MB/site.`,
    });
    await persistStore();
    res.json({ limits: store.limits });
  });

  app.post('/api/admin/announcements', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const { title, message, severity } = req.body || {};
    const cleanTitle = String(title || '').trim();
    const cleanMsg = String(message || '').trim();
    if (cleanTitle.length < 2 || cleanMsg.length < 2) {
      res.status(400).json({ error: 'Informe título e mensagem para o aviso.' });
      return;
    }
    const sev = severity === 'warning' || severity === 'maintenance' ? severity : 'info';
    const item: AnnouncementRecord = {
      id: `ann_${crypto.randomUUID().slice(0, 12)}`,
      title: cleanTitle.slice(0, 120),
      message: cleanMsg.slice(0, 600),
      severity: sev,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const store = getStore();
    store.announcements.unshift(item);
    await persistStore();
    res.status(201).json({ announcement: item });
  });

  app.patch('/api/admin/announcements/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const store = getStore();
    const item = store.announcements.find((a) => a.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Aviso não encontrado.' });
      return;
    }
    if (typeof req.body?.active === 'boolean') {
      item.active = req.body.active;
    }
    await persistStore();
    res.json({ announcement: item });
  });

  app.delete('/api/admin/announcements/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const store = getStore();
    store.announcements = store.announcements.filter((a) => a.id !== req.params.id);
    await persistStore();
    res.json({ ok: true });
  });

  app.patch('/api/admin/reports/:reportId', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
    const store = getStore();
    const report = store.reports.find((r) => r.id === req.params.reportId);
    if (!report) {
      res.status(404).json({ error: 'Denúncia não encontrada.' });
      return;
    }
    const status = req.body?.status;
    if (status === 'resolved' || status === 'dismissed' || status === 'open') {
      report.status = status;
      report.resolvedAt = status === 'open' ? null : new Date().toISOString();
    }
    await persistStore();
    res.json({ report });
  });

  app.get('/api/admin/backup', requireAuth, requireAdmin, (req: AuthRequest, res: Response) => {
    const store = getStore();
    addSecurityLog({
      level: 'info',
      category: 'admin',
      uid: req.authUser!.uid,
      ip: getClientIp(req),
      message: 'Backup completo de metadados exportado pelo administrador.',
    });
    res.setHeader('Content-Disposition', `attachment; filename="novahospeda-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(store);
  });

  // --- Frontend Serving (Vite Dev Middleware or Production Dist) ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build dist/index.html não encontrado. Execute npm run build.');
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NovaHospeda server running on http://0.0.0.0:${PORT} (domain: ${PRIMARY_DOMAIN})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
