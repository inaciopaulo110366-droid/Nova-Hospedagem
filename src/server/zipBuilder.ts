import path from 'node:path';
import type { ExtractedFile } from './security.ts';

export interface AutoBuildResult {
  built: boolean;
  files: ExtractedFile[];
  entryFile: string;
  buildNote?: string | null;
}

const SOURCE_ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.jsx',
  'src/main.ts',
  'src/main.js',
  'src/index.tsx',
  'src/index.jsx',
  'main.tsx',
  'main.jsx',
  'src/App.tsx',
  'src/App.jsx',
  'App.tsx',
  'App.jsx',
];

const RESOLVE_EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];

function cleanSemver(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^[\^~>=<\s]+/, '');
  if (/^\d+\.\d+\.\d+/.test(cleaned)) {
    return cleaned.split(/\s+/)[0];
  }
  return null;
}

function getPackageRoot(specifier: string): { pkgName: string; subpath: string } {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    const pkgName = parts.slice(0, 2).join('/');
    const subpath = parts.length > 2 ? '/' + parts.slice(2).join('/') : '';
    return { pkgName, subpath };
  }
  const slashIdx = specifier.indexOf('/');
  if (slashIdx === -1) {
    return { pkgName: specifier, subpath: '' };
  }
  return {
    pkgName: specifier.slice(0, slashIdx),
    subpath: specifier.slice(slashIdx),
  };
}

export function looksLikeSourceProject(files: ExtractedFile[], entryFile: string): boolean {
  const entry = files.find((f) => f.path.toLowerCase() === entryFile.toLowerCase());
  if (entry) {
    const html = entry.content.toString('utf8');
    if (/<script[^>]+src=["'][^"']+\.(?:tsx|jsx|ts)["']/i.test(html)) {
      return true;
    }
    if (/src=["']\/?src\/(?:main|index)\.(?:tsx?|jsx?)["']/i.test(html)) {
      return true;
    }
  }
  return false;
}

export async function tryAutoBuildSourceProject(
  files: ExtractedFile[],
  entryFile: string
): Promise<AutoBuildResult> {
  if (!looksLikeSourceProject(files, entryFile)) {
    return { built: false, files, entryFile };
  }

  let esbuild: typeof import('esbuild');
  try {
    esbuild = await import('esbuild');
  } catch {
    return { built: false, files, entryFile };
  }

  const fileMap = new Map<string, ExtractedFile>();
  const lowerMap = new Map<string, ExtractedFile>();
  for (const f of files) {
    fileMap.set(f.path, f);
    lowerMap.set(f.path.toLowerCase(), f);
  }

  const getVirtualFile = (relPath: string): ExtractedFile | undefined => {
    const clean = relPath.replace(/^\/+/, '');
    return fileMap.get(clean) || lowerMap.get(clean.toLowerCase());
  };

  const resolveVirtualPath = (baseDir: string, importPath: string): string | null => {
    const candidates: string[] = [];
    if (importPath.startsWith('@/')) {
      const stripped = importPath.slice(2);
      candidates.push(stripped, `src/${stripped}`);
    } else if (importPath.startsWith('/')) {
      candidates.push(importPath.slice(1));
    } else {
      const joined = path.posix.normalize(
        baseDir ? `${baseDir}/${importPath}` : importPath
      );
      if (!joined.startsWith('..')) {
        candidates.push(joined);
      }
    }

    for (const candidate of candidates) {
      for (const ext of RESOLVE_EXTENSIONS) {
        const direct = getVirtualFile(candidate + ext);
        if (direct) return direct.path;
      }
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const idxFile = getVirtualFile(`${candidate}/index${ext}`);
        if (idxFile) return idxFile.path;
      }
    }
    return null;
  };

  // Detect entry script from index.html or candidate list
  const entryHtmlFile = getVirtualFile(entryFile);
  let htmlContent = entryHtmlFile ? entryHtmlFile.content.toString('utf8') : '';
  let detectedScriptPath: string | null = null;

  if (htmlContent) {
    const match = htmlContent.match(
      /<script[^>]+src=["']([^"']+\.(?:tsx?|jsx?))["'][^>]*>/i
    );
    if (match && match[1]) {
      const rawSrc = match[1].replace(/^\.\//, '').replace(/^\//, '');
      const found = getVirtualFile(rawSrc);
      if (found) detectedScriptPath = found.path;
    }
  }

  if (!detectedScriptPath) {
    for (const cand of SOURCE_ENTRY_CANDIDATES) {
      const found = getVirtualFile(cand);
      if (found) {
        detectedScriptPath = found.path;
        break;
      }
    }
  }

  if (!detectedScriptPath) {
    return { built: false, files, entryFile };
  }

  let usesTailwind = false;
  for (const f of files) {
    if (f.path.toLowerCase().endsWith('.css')) {
      const cssText = f.content.toString('utf8');
      if (/@import\s+["']tailwindcss["']|@tailwind\s+(?:base|components|utilities)/i.test(cssText)) {
        usesTailwind = true;
        break;
      }
    }
  }

  // Parse package.json dependencies if available
  const pkgJsonFile = getVirtualFile('package.json');
  let pkgDeps: Record<string, string> = {};
  if (pkgJsonFile) {
    try {
      const parsed = JSON.parse(pkgJsonFile.content.toString('utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      pkgDeps = { ...(parsed.devDependencies || {}), ...(parsed.dependencies || {}) };
      if (pkgDeps.tailwindcss || pkgDeps['@tailwindcss/vite']) {
        usesTailwind = true;
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  const externalSpecifiers = new Set<string>();
  const syntheticWrapperEntry = '__nh_virtual_entry__.tsx';
  const entryBaseName = path.posix.basename(detectedScriptPath).toLowerCase();
  const needsAppMountWrapper = entryBaseName === 'app.tsx' || entryBaseName === 'app.jsx';

  try {
    const result = await esbuild.build({
      entryPoints: [needsAppMountWrapper ? syntheticWrapperEntry : detectedScriptPath],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      outdir: 'assets',
      entryNames: 'app',
      minify: true,
      jsx: 'automatic',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      loader: {
        '.png': 'dataurl',
        '.jpg': 'dataurl',
        '.jpeg': 'dataurl',
        '.gif': 'dataurl',
        '.webp': 'dataurl',
        '.svg': 'dataurl',
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
        '.ttf': 'dataurl',
      },
      plugins: [
        {
          name: 'nh-virtual-fs',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.path === syntheticWrapperEntry) {
                return { path: args.path, namespace: 'nh-vfs' };
              }
              if (
                args.path.startsWith('http://') ||
                args.path.startsWith('https://') ||
                args.path.startsWith('data:')
              ) {
                return { path: args.path, external: true };
              }
              if (
                args.kind === 'entry-point' ||
                args.path.startsWith('./') ||
                args.path.startsWith('../') ||
                args.path.startsWith('@/') ||
                args.path.startsWith('/')
              ) {
                const importerDir = args.importer
                  ? path.posix.dirname(args.importer)
                  : '';
                const resolved = resolveVirtualPath(importerDir, args.path);
                if (resolved) {
                  return { path: resolved, namespace: 'nh-vfs' };
                }
                if (args.path.startsWith('/')) {
                  return { path: args.path, external: true };
                }
              }

              // Check if relative-without-dot matches a virtual file
              if (args.importer) {
                const importerDir = path.posix.dirname(args.importer);
                const resolved = resolveVirtualPath(importerDir, `./${args.path}`);
                if (resolved) {
                  return { path: resolved, namespace: 'nh-vfs' };
                }
              }

              externalSpecifiers.add(args.path);
              return { path: args.path, external: true };
            });

            build.onLoad({ filter: /.*/, namespace: 'nh-vfs' }, (args) => {
              if (args.path === syntheticWrapperEntry) {
                return {
                  contents: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './${detectedScriptPath}';
const rootEl = document.getElementById('root') || document.body.appendChild(document.createElement('div'));
createRoot(rootEl).render(React.createElement(App));
`,
                  loader: 'tsx',
                };
              }

              const file = getVirtualFile(args.path);
              if (!file) return null;
              const ext = path.posix.extname(file.path).toLowerCase();
              if (ext === '.css') {
                let css = file.content.toString('utf8');
                if (/@import\s+["']tailwindcss["']|@tailwind\s+/i.test(css)) {
                  usesTailwind = true;
                  css = css
                    .replace(/@import\s+["']tailwindcss["'];?/gi, '')
                    .replace(/@tailwind\s+(?:base|components|utilities);?/gi, '');
                }
                return { contents: css, loader: 'css' };
              }
              if (ext === '.tsx') return { contents: file.content, loader: 'tsx' };
              if (ext === '.ts') return { contents: file.content, loader: 'ts' };
              if (ext === '.jsx') return { contents: file.content, loader: 'jsx' };
              if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
                return { contents: file.content, loader: 'js' };
              }
              if (ext === '.json') return { contents: file.content, loader: 'json' };
              if (
                ext === '.png' ||
                ext === '.jpg' ||
                ext === '.jpeg' ||
                ext === '.gif' ||
                ext === '.webp' ||
                ext === '.svg' ||
                ext === '.woff' ||
                ext === '.woff2' ||
                ext === '.ttf'
              ) {
                return { contents: file.content, loader: 'dataurl' };
              }
              return { contents: file.content, loader: 'text' };
            });
          },
        },
      ],
    });

    const compiledFiles: ExtractedFile[] = [];
    let hasCssOutput = false;

    for (const out of result.outputFiles || []) {
      const rel = out.path
        .replace(/\\/g, '/')
        .replace(/^.*\/(assets\/[^/]+)$/, '$1')
        .replace(/^.*?(assets\/.*)$/, '$1');
      const finalPath = rel.startsWith('assets/') ? rel : `assets/${path.posix.basename(out.path)}`;
      if (finalPath.endsWith('.css')) hasCssOutput = true;
      compiledFiles.push({
        path: finalPath,
        content: Buffer.from(out.contents),
      });
    }

    // Build browser importmap for external npm packages via esm.sh
    const reactVer = cleanSemver(pkgDeps.react) || '19.0.1';
    const reactDomVer = cleanSemver(pkgDeps['react-dom']) || reactVer;
    const importMap: Record<string, string> = {
      react: `https://esm.sh/react@${reactVer}`,
      'react/jsx-runtime': `https://esm.sh/react@${reactVer}/jsx-runtime`,
      'react/jsx-dev-runtime': `https://esm.sh/react@${reactVer}/jsx-dev-runtime`,
      'react-dom': `https://esm.sh/react-dom@${reactDomVer}?deps=react@${reactVer}`,
      'react-dom/client': `https://esm.sh/react-dom@${reactDomVer}/client?deps=react@${reactVer}`,
    };

    for (const spec of externalSpecifiers) {
      if (importMap[spec]) continue;
      const { pkgName, subpath } = getPackageRoot(spec);
      const ver = cleanSemver(pkgDeps[pkgName]);
      const verSuffix = ver ? `@${ver}` : '';
      if (pkgName === 'react' || pkgName === 'react-dom') {
        importMap[spec] = `https://esm.sh/${pkgName}@${pkgName === 'react' ? reactVer : reactDomVer}${subpath}${
          pkgName === 'react-dom' ? `?deps=react@${reactVer}` : ''
        }`;
      } else {
        importMap[spec] = `https://esm.sh/${pkgName}${verSuffix}${subpath}?deps=react@${reactVer},react-dom@${reactDomVer}`;
      }
    }

    const importMapScript = `<script type="importmap">\n${JSON.stringify({ imports: importMap }, null, 2)}\n</script>`;
    const tailwindScript = usesTailwind
      ? '<script src="https://cdn.tailwindcss.com"></script>'
      : '';
    const cssLink = hasCssOutput ? '<link rel="stylesheet" href="./assets/app.css" />' : '';
    const appScript = '<script type="module" src="./assets/app.js"></script>';

    let finalHtml = htmlContent;
    if (!finalHtml) {
      finalHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Site Publicado — NovaHospeda</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
    } else {
      // Remove source module script(s) pointing to .ts/.tsx/.jsx
      finalHtml = finalHtml.replace(
        /<script\b[^>]*src=["'][^"']+\.(?:tsx?|jsx?)["'][^>]*>\s*<\/script>/gi,
        ''
      );
    }

    const headInject = [tailwindScript, importMapScript, cssLink].filter(Boolean).join('\n  ');
    if (/<\/head>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<\/head>/i, `  ${headInject}\n</head>`);
    } else {
      finalHtml = `${headInject}\n${finalHtml}`;
    }

    if (/<\/body>/i.test(finalHtml)) {
      finalHtml = finalHtml.replace(/<\/body>/i, `  ${appScript}\n</body>`);
    } else {
      finalHtml = `${finalHtml}\n${appScript}`;
    }

    compiledFiles.push({
      path: 'index.html',
      content: Buffer.from(finalHtml, 'utf8'),
    });

    // Preserve static public/ files & media assets at root
    for (const f of files) {
      const lower = f.path.toLowerCase();
      if (lower.startsWith('public/')) {
        const pubRel = f.path.slice('public/'.length);
        if (pubRel && pubRel.toLowerCase() !== 'index.html') {
          compiledFiles.push({ path: pubRel, content: f.content });
        }
      } else if (
        /\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp3|mp4|webm|pdf|json)$/i.test(lower) &&
        !lower.endsWith('package.json') &&
        !lower.endsWith('package-lock.json') &&
        !lower.endsWith('tsconfig.json') &&
        !lower.endsWith('metadata.json') &&
        !lower.startsWith('src/')
      ) {
        if (!compiledFiles.some((c) => c.path.toLowerCase() === lower)) {
          compiledFiles.push(f);
        }
      }
    }

    return {
      built: true,
      files: compiledFiles,
      entryFile: 'index.html',
      buildNote:
        'Projeto React/TypeScript/Vite compilado automaticamente pelo leitor de ZIP da NovaHospeda para execução imediata no navegador e compatibilidade com Netlify.',
    };
  } catch (err) {
    console.warn('Auto-build fallback failed:', err);
    return { built: false, files, entryFile };
  }
}
