import path from 'node:path';
import JSZip from 'jszip';
import { tryAutoBuildSourceProject } from './zipBuilder.ts';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'dvenancio767@gmail.com';
const rawPrimaryDomain = (process.env.NH_PRIMARY_DOMAIN || process.env.PRIMARY_DOMAIN || '').trim();
export const PRIMARY_DOMAIN =
  rawPrimaryDomain && rawPrimaryDomain.includes('.') && !/^\d+$/.test(rawPrimaryDomain)
    ? rawPrimaryDomain
    : 'nh.com.br';

export const RESERVED_SUBDOMAINS = new Set<string>([
  'www', 'api', 'admin', 'root', 'mail', 'smtp', 'imap', 'pop', 'ftp', 'sftp', 'ssh',
  'ns1', 'ns2', 'ns3', 'dns', 'cdn', 'app', 'panel', 'painel', 'dashboard', 'console',
  'auth', 'login', 'logout', 'signup', 'register', 'cadastro', 'conta', 'account',
  'static', 'assets', 'media', 'img', 'images', 'files', 'uploads', 'status', 'health',
  'docs', 'doc', 'help', 'ajuda', 'support', 'suporte', 'billing', 'planos', 'plans',
  'novahospeda', 'nh', 'localhost', 'test', 'teste', 'dev', 'staging', 'preview',
  'sites', 'site', 's', 'report', 'abuse', 'denuncia', 'terms', 'termos', 'privacy',
  'privacidade', 'ssl', 'cert', 'acme', 'well-known', 'robots', 'sitemap', 'webmail',
  'cloud', 'edge', 'proxy', 'portal',
]);

export const ALLOWED_STATIC_EXTENSIONS = new Set<string>([
  '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.astro',
  '.json', '.json5', '.jsonl', '.geojson', '.topojson', '.svg',
  '.png', '.jpg', '.jpeg', '.jpe', '.jfif', '.gif', '.webp', '.avif', '.heic', '.heif', '.ico', '.cur', '.bmp', '.tif', '.tiff', '.apng', '.jxl',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.sfnt',
  '.txt', '.xml', '.xsl', '.xslt', '.rss', '.atom', '.webmanifest', '.manifest', '.appcache',
  '.map', '.md', '.mdx', '.csv', '.tsv', '.yaml', '.yml', '.toml',
  '.wasm', '.wat', '.vtt', '.srt', '.ics', '.vcf', '.log', '.lock', '.example', '.sample',
  '.graphql', '.gql', '.glsl', '.vert', '.frag', '.wgsl',
  '.mp4', '.m4v', '.mov', '.webm', '.ogv', '.ogg', '.oga', '.mp3', '.m4a', '.aac', '.wav', '.flac', '.opus', '.mid', '.midi',
  '.pdf', '.epub', '.lottie', '.riv', '.glb', '.gltf', '.bin', '.obj', '.mtl', '.stl', '.fbx',
]);

export const BLOCKED_EXECUTABLE_EXTENSIONS = new Set<string>([
  '.php', '.php3', '.php4', '.php5', '.phtml', '.phar',
  '.py', '.pyc', '.rb', '.pl', '.cgi', '.sh', '.bash', '.zsh',
  '.exe', '.bat', '.cmd', '.com', '.msi', '.dll', '.so', '.dylib',
  '.jsp', '.jspx', '.asp', '.aspx', '.ashx', '.asmx',
  '.htaccess', '.htpasswd', '.env', '.ini', '.conf',
]);

export const TEXT_EDITABLE_EXTENSIONS = new Set<string>([
  '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.astro',
  '.json', '.json5', '.geojson', '.svg', '.txt', '.xml', '.webmanifest',
  '.md', '.mdx', '.csv', '.tsv', '.yaml', '.yml', '.toml', '.example', '.vtt', '.srt',
]);

export const SAFE_EXTENSIONLESS_FILES = new Set<string>([
  'cname', 'license', 'licence', 'notice', 'readme', 'changelog', 'authors', 'contributors', '.nojekyll',
]);

export function shouldIgnoreNonDeployEntry(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  const base = path.posix.basename(lower);
  const parts = lower.split('/').filter(Boolean);

  if (
    parts.includes('__macosx') ||
    parts.includes('node_modules') ||
    parts.includes('.git') ||
    parts.includes('.github') ||
    parts.includes('.vscode') ||
    parts.includes('.idea') ||
    parts.includes('.next') ||
    parts.includes('.nuxt') ||
    parts.includes('.svelte-kit') ||
    parts.includes('.turbo') ||
    parts.includes('.cache') ||
    parts.includes('.parcel-cache') ||
    parts.includes('.vite') ||
    parts.includes('.vercel') ||
    parts.includes('.netlify') ||
    parts.includes('.firebase') ||
    parts.includes('__pycache__')
  ) {
    return true;
  }

  if (
    base === '.ds_store' ||
    base === 'thumbs.db' ||
    base === 'desktop.ini' ||
    base === '.gitignore' ||
    base === '.gitattributes' ||
    base === '.gitkeep' ||
    base === '.keep' ||
    base === '.npmignore' ||
    base === '.npmrc' ||
    base === '.nvmrc' ||
    base === '.yarnrc' ||
    base === '.yarnrc.yml' ||
    base === '.browserslistrc' ||
    base === '.replit' ||
    base === 'replit.nix' ||
    base === 'dockerfile' ||
    base === 'makefile' ||
    base === 'procfile' ||
    base === '.editorconfig' ||
    base === '.dockerignore' ||
    base === '.prettierignore' ||
    base === '.eslintignore' ||
    base.startsWith('.prettierrc') ||
    base.startsWith('.eslintrc') ||
    base === '.env' ||
    (base.startsWith('.env.') && base !== '.env.example')
  ) {
    return true;
  }

  return false;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.xhtml': 'application/xhtml+xml; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.scss': 'text/plain; charset=utf-8',
  '.sass': 'text/plain; charset=utf-8',
  '.less': 'text/plain; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.vue': 'text/plain; charset=utf-8',
  '.svelte': 'text/plain; charset=utf-8',
  '.astro': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.json5': 'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.topojson': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.apng': 'image/apng',
  '.jxl': 'image/jxl',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.sfnt': 'font/sfnt',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.xsl': 'application/xml; charset=utf-8',
  '.xslt': 'application/xslt+xml; charset=utf-8',
  '.rss': 'application/rss+xml; charset=utf-8',
  '.atom': 'application/atom+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.manifest': 'text/cache-manifest; charset=utf-8',
  '.appcache': 'text/cache-manifest; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wat': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.vcf': 'text/vcard; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.lock': 'text/plain; charset=utf-8',
  '.example': 'text/plain; charset=utf-8',
  '.sample': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.lottie': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
};

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function isTextEditable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (!ext) {
    return SAFE_EXTENSIONLESS_FILES.has(path.posix.basename(filePath).toLowerCase());
  }
  return TEXT_EDITABLE_EXTENSIONS.has(ext);
}

export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateSubdomainSlug(rawSlug: string): { valid: boolean; slug: string; reason?: string } {
  const slug = rawSlug.trim().toLowerCase();
  if (slug.length < 3 || slug.length > 48) {
    return { valid: false, slug, reason: 'O subdomínio deve ter entre 3 e 48 caracteres.' };
  }
  if (!/^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$/.test(slug)) {
    return {
      valid: false,
      slug,
      reason: 'Use apenas letras minúsculas (a-z), números (0-9) e hífens no meio.',
    };
  }
  if (slug.includes('--')) {
    return { valid: false, slug, reason: 'O subdomínio não pode conter dois hífens seguidos (--).' };
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { valid: false, slug, reason: `O subdomínio "${slug}" é reservado pela plataforma.` };
  }
  return { valid: true, slug };
}

export interface DomainSuggestion {
  slug: string;
  fullDomain: string;
  isExactMatch: boolean;
}

export function generateAvailableDomainSuggestions(
  siteName: string,
  isSlugTaken: (slug: string) => boolean,
  primaryDomain = PRIMARY_DOMAIN
): DomainSuggestion[] {
  let base = normalizeSlug(siteName);
  if (!base || base.length < 3) {
    base = base ? `${base}-site` : 'meu-app';
  }
  if (base.length > 36) {
    base = base.slice(0, 36).replace(/-+$/g, '');
  }

  const candidateBases = [
    base,
    `${base}-app`,
    `${base}-site`,
    `${base}-web`,
    `${base}-br`,
    `${base}-online`,
    `app-${base}`,
    `site-${base}`,
    `${base}-oficial`,
  ];

  // Add deterministic numbered fallbacks in case all common variants are taken
  for (let n = 1; n <= 9; n++) {
    candidateBases.push(`${base}-${n}`);
  }

  const suggestions: DomainSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < candidateBases.length; i++) {
    const raw = candidateBases[i].replace(/--+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
    if (seen.has(raw)) continue;
    seen.add(raw);

    const check = validateSubdomainSlug(raw);
    if (!check.valid) continue;
    if (isSlugTaken(check.slug)) continue;

    suggestions.push({
      slug: check.slug,
      fullDomain: `${check.slug}.${primaryDomain}`,
      isExactMatch: i === 0,
    });

    if (suggestions.length >= 6) break;
  }

  return suggestions;
}

export function sanitizeRelativePath(rawPath: string): string | null {
  if (!rawPath || rawPath.includes('\0')) return null;
  const unified = rawPath.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!unified || unified.length > 240) return null;

  const segments = unified.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  for (const seg of segments) {
    if (seg === '.' || seg === '..' || seg.includes('..') || /[\x00-\x1f<>:"|?*]/.test(seg)) {
      return null;
    }
  }

  return segments.join('/');
}

export function validateStaticFileExtension(relPath: string): { valid: boolean; reason?: string } {
  const baseName = path.posix.basename(relPath).toLowerCase();
  if (baseName === '.htaccess' || baseName === '.htpasswd' || baseName === '.env' || baseName.startsWith('.git')) {
    return { valid: false, reason: `Arquivo restrito por segurança: ${relPath}` };
  }
  const ext = path.posix.extname(relPath).toLowerCase();
  if (!ext) {
    if (SAFE_EXTENSIONLESS_FILES.has(baseName) || relPath.toLowerCase().startsWith('.well-known/')) {
      return { valid: true };
    }
    return { valid: false, reason: `Arquivo sem extensão permitida: ${relPath}` };
  }
  if (BLOCKED_EXECUTABLE_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Execução de scripts no servidor não é permitida (${ext}): ${relPath}` };
  }
  if (!ALLOWED_STATIC_EXTENSIONS.has(ext)) {
    return { valid: false, reason: `Extensão não suportada para hospedagem estática (${ext}): ${relPath}` };
  }
  return { valid: true };
}

export interface ExtractedFile {
  path: string;
  content: Buffer;
}

export interface ZipExtractionResult {
  files: ExtractedFile[];
  totalSizeBytes: number;
  entryFile: string;
  strippedWrapperFolder: string | null;
  sourceOnlyWarning?: string | null;
  autoBuilt?: boolean;
  autoBuildNote?: string | null;
  skippedCount?: number;
}

export function detectUnbuiltSourceWarning(files: ExtractedFile[], entryFile: string): string | null {
  const entry = files.find((f) => f.path.toLowerCase() === entryFile.toLowerCase());
  if (!entry) return null;
  const html = entry.content.toString('utf8');
  if (/src=["']\/?src\/(?:main|index)\.(?:tsx?|jsx?)["']/i.test(html)) {
    return 'Detectamos um projeto em código-fonte (Vite/React .tsx/.jsx) ainda não compilado para HTML/JS de produção. Para o site funcionar completo no navegador, envie o conteúdo da pasta dist/ gerada após o build ou um index.html estático.';
  }
  return null;
}

export function promoteCompiledBuildDir(files: ExtractedFile[]): {
  files: ExtractedFile[];
  promotedDir: string | null;
} {
  const rootIndex = files.find((f) => f.path.toLowerCase() === 'index.html');
  const rootLooksLikeViteSource =
    rootIndex && /src=["']\/?src\/(?:main|index)\.(?:tsx?|jsx?)["']/i.test(rootIndex.content.toString('utf8'));

  if (rootIndex && !rootLooksLikeViteSource) {
    return { files, promotedDir: null };
  }

  for (const candidateDir of ['dist', 'build', 'out', 'www', 'htdocs', 'site']) {
    const prefix = `${candidateDir}/`;
    const hasDirIndex = files.some((f) => f.path.toLowerCase() === `${prefix}index.html`);
    if (hasDirIndex) {
      const subFiles = files
        .filter((f) => f.path.toLowerCase().startsWith(prefix))
        .map((f) => ({
          path: f.path.slice(prefix.length),
          content: f.content,
        }));
      return { files: subFiles, promotedDir: candidateDir };
    }
  }

  // For pure static templates placed in public/ without a Vite src folder
  const hasSourceFolder = files.some((f) => f.path.toLowerCase().startsWith('src/'));
  if (!rootIndex && !hasSourceFolder) {
    const prefix = 'public/';
    if (files.some((f) => f.path.toLowerCase() === `${prefix}index.html`)) {
      const subFiles = files
        .filter((f) => f.path.toLowerCase().startsWith(prefix))
        .map((f) => ({
          path: f.path.slice(prefix.length),
          content: f.content,
        }));
      return { files: subFiles, promotedDir: 'public' };
    }
  }

  return { files, promotedDir: null };
}

const MAX_ZIP_FILE_COUNT = 2000;

export async function safelyExtractZip(
  zipBuffer: Buffer,
  maxTotalBytes: number
): Promise<ZipExtractionResult> {
  if (zipBuffer.byteLength > maxTotalBytes) {
    throw new Error(`Arquivo ZIP excede o limite de ${(maxTotalBytes / (1024 * 1024)).toFixed(0)} MB.`);
  }

  // Verify ZIP magic header (PK)
  if (zipBuffer.byteLength < 4 || zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b) {
    throw new Error('O arquivo enviado não é um pacote ZIP válido.');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer, { checkCRC32: false });
  } catch {
    throw new Error('Falha ao ler arquivo ZIP. Verifique se o pacote não está corrompido.');
  }

  const rawEntries: Array<{ rawPath: string; entry: JSZip.JSZipObject }> = [];
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const normalized = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || shouldIgnoreNonDeployEntry(normalized)) {
      continue;
    }
    rawEntries.push({ rawPath: normalized, entry });
  }

  if (rawEntries.length === 0) {
    throw new Error('O arquivo ZIP não contém arquivos válidos.');
  }

  if (rawEntries.length > MAX_ZIP_FILE_COUNT) {
    throw new Error(`Proteção contra ZIP bomb: máximo de ${MAX_ZIP_FILE_COUNT} arquivos por publicação.`);
  }

  // Strip nested single top-level wrapper folders iteratively (e.g. "repo-main/meu-site/index.html")
  const strippedFolders: string[] = [];
  let workingEntries = rawEntries.map((item) => ({
    relPath: item.rawPath,
    entry: item.entry,
  }));

  for (let depth = 0; depth < 3; depth++) {
    const hasRootIndex = workingEntries.some((item) => item.relPath.toLowerCase() === 'index.html');
    const hasPackageJson = workingEntries.some((item) => item.relPath.toLowerCase() === 'package.json');
    if (hasRootIndex || hasPackageJson) break;

    const firstSegments = new Set<string>();
    let allNested = true;
    for (const item of workingEntries) {
      const parts = item.relPath.split('/').filter(Boolean);
      if (parts.length < 2) {
        allNested = false;
        break;
      }
      firstSegments.add(parts[0]);
    }
    if (!allNested || firstSegments.size !== 1) break;

    const folder = Array.from(firstSegments)[0];
    strippedFolders.push(folder);
    workingEntries = workingEntries.map((item) => ({
      relPath: item.relPath.slice(folder.length + 1),
      entry: item.entry,
    }));
  }

  const strippedWrapperFolder = strippedFolders.length > 0 ? strippedFolders.join('/') : null;

  const extracted: ExtractedFile[] = [];
  let cumulativeBytes = 0;
  let skippedCount = 0;

  for (const item of workingEntries) {
    const safeRel = sanitizeRelativePath(item.relPath);
    if (!safeRel) {
      skippedCount++;
      continue;
    }

    const extCheck = validateStaticFileExtension(safeRel);
    if (!extCheck.valid) {
      // Gracefully skip server-side/config files inside multi-file ZIPs instead of failing the entire site
      skippedCount++;
      continue;
    }

    // Stream/decompress while enforcing cumulative size limit to block ZIP bombs
    const buf = await item.entry.async('nodebuffer');
    cumulativeBytes += buf.byteLength;
    if (cumulativeBytes > maxTotalBytes) {
      throw new Error(
        `Proteção contra ZIP bomb: conteúdo descompactado ultrapassou o limite de ${(
          maxTotalBytes /
          (1024 * 1024)
        ).toFixed(0)} MB.`
      );
    }

    extracted.push({ path: safeRel, content: buf });
  }

  if (extracted.length === 0) {
    throw new Error(
      'Nenhum arquivo web estático (HTML, CSS, JS ou imagens) foi encontrado neste ZIP.'
    );
  }

  const promoted = promoteCompiledBuildDir(extracted);
  let finalFiles = promoted.files;
  const finalWrapper = promoted.promotedDir
    ? strippedWrapperFolder
      ? `${strippedWrapperFolder}/${promoted.promotedDir}`
      : promoted.promotedDir
    : strippedWrapperFolder;

  let entryFile = detectEntryHtml(finalFiles.map((f) => f.path));

  // If no HTML file exists at all, check if it's a React/Vite app without HTML and synthesize an entry
  if (!entryFile) {
    const hasReactEntry = finalFiles.some((f) =>
      /^(?:src\/)?(?:main|index|app)\.(?:tsx|jsx)$/i.test(f.path)
    );
    if (hasReactEntry) {
      const targetScript =
        finalFiles.find((f) => /^(?:src\/)?(?:main|index)\.(?:tsx|jsx)$/i.test(f.path))?.path ||
        finalFiles.find((f) => /^(?:src\/)?app\.(?:tsx|jsx)$/i.test(f.path))!.path;
      const synthHtml = `<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Site Publicado</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/${targetScript}"></script>\n</body>\n</html>`;
      finalFiles = [...finalFiles, { path: 'index.html', content: Buffer.from(synthHtml, 'utf8') }];
      entryFile = 'index.html';
    }
  }

  if (!entryFile) {
    throw new Error(
      'Nenhum arquivo index.html ou página HTML foi encontrado no pacote. Inclua um arquivo index.html na raiz ou pasta principal do ZIP.'
    );
  }

  // Automatically compile Vite/React/TypeScript source projects into static browser-ready HTML+JS+CSS
  const autoBuild = await tryAutoBuildSourceProject(finalFiles, entryFile);
  let autoBuilt = false;
  let autoBuildNote: string | null = null;
  let sourceOnlyWarning: string | null = null;

  if (autoBuild.built) {
    finalFiles = autoBuild.files;
    entryFile = autoBuild.entryFile;
    autoBuilt = true;
    autoBuildNote = autoBuild.buildNote || null;
  } else {
    sourceOnlyWarning = detectUnbuiltSourceWarning(finalFiles, entryFile);
  }

  const finalTotalBytes = finalFiles.reduce((acc, f) => acc + f.content.byteLength, 0);

  return {
    files: finalFiles,
    totalSizeBytes: finalTotalBytes,
    entryFile,
    strippedWrapperFolder: finalWrapper,
    sourceOnlyWarning,
    autoBuilt,
    autoBuildNote,
    skippedCount,
  };
}

export function detectEntryHtml(paths: string[]): string | null {
  const exactRoot = paths.find((p) => p.toLowerCase() === 'index.html');
  if (exactRoot) return exactRoot;
  const htmRoot = paths.find((p) => p.toLowerCase() === 'index.htm');
  if (htmRoot) return htmRoot;
  const nestedIndex = paths.find((p) => p.toLowerCase().endsWith('/index.html'));
  if (nestedIndex) return nestedIndex;
  const anyHtml = paths.find((p) => p.toLowerCase().endsWith('.html') || p.toLowerCase().endsWith('.htm'));
  return anyHtml || null;
}
