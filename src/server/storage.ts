import fs from 'node:fs/promises';
import path from 'node:path';
import { getMimeType, isTextEditable, sanitizeRelativePath } from './security.ts';
import type { ExtractedFile } from './security.ts';
import type { SiteFileEntry } from './types.ts';

export interface StorageProvider {
  readonly driverName: string;
  writeVersion(siteId: string, versionId: string, files: ExtractedFile[]): Promise<void>;
  copyVersionToDraft(siteId: string, versionId: string): Promise<void>;
  promoteVersionToLive(siteId: string, versionId: string): Promise<void>;
  listFiles(siteId: string, scope: 'live' | 'draft' | string): Promise<SiteFileEntry[]>;
  readFile(siteId: string, scope: 'live' | 'draft' | string, relPath: string): Promise<Buffer | null>;
  writeDraftFile(siteId: string, relPath: string, content: Buffer): Promise<void>;
  deleteDraftFile(siteId: string, relPath: string): Promise<boolean>;
  snapshotDraftAsVersion(siteId: string, newVersionId: string): Promise<{ fileCount: number; totalSizeBytes: number }>;
  deleteSiteStorage(siteId: string): Promise<void>;
  getDiskUsageBytes(): Promise<number>;
}

const DATA_ROOT = path.resolve(process.cwd(), 'data', 'storage', 'sites');

export class LocalDiskStorageProvider implements StorageProvider {
  readonly driverName: string = 'local-filesystem';

  private resolveScopeDir(siteId: string, scope: string): string {
    const safeSite = siteId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeSite) throw new Error('ID de site inválido.');
    if (scope === 'live') {
      return path.resolve(DATA_ROOT, safeSite, 'live');
    }
    if (scope === 'draft') {
      return path.resolve(DATA_ROOT, safeSite, 'draft');
    }
    const safeVer = scope.replace(/[^a-zA-Z0-9_-]/g, '');
    return path.resolve(DATA_ROOT, safeSite, 'versions', safeVer);
  }

  private resolveSafeTarget(baseDir: string, relPath: string): string {
    const cleanRel = sanitizeRelativePath(relPath);
    if (!cleanRel) throw new Error('Caminho de arquivo inválido.');
    const resolved = path.resolve(baseDir, cleanRel);
    const normalizedBase = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
    if (!resolved.startsWith(normalizedBase)) {
      throw new Error('Tentativa de path traversal bloqueada.');
    }
    return resolved;
  }

  async writeVersion(siteId: string, versionId: string, files: ExtractedFile[]): Promise<void> {
    const verDir = this.resolveScopeDir(siteId, versionId);
    await fs.rm(verDir, { recursive: true, force: true });
    await fs.mkdir(verDir, { recursive: true });

    for (const file of files) {
      const target = this.resolveSafeTarget(verDir, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content);
    }
  }

  async copyVersionToDraft(siteId: string, versionId: string): Promise<void> {
    const verDir = this.resolveScopeDir(siteId, versionId);
    const draftDir = this.resolveScopeDir(siteId, 'draft');
    await fs.rm(draftDir, { recursive: true, force: true });
    await fs.mkdir(draftDir, { recursive: true });
    await fs.cp(verDir, draftDir, { recursive: true, force: true });
  }

  async promoteVersionToLive(siteId: string, versionId: string): Promise<void> {
    const verDir = this.resolveScopeDir(siteId, versionId);
    const liveDir = this.resolveScopeDir(siteId, 'live');
    await fs.rm(liveDir, { recursive: true, force: true });
    await fs.mkdir(liveDir, { recursive: true });
    await fs.cp(verDir, liveDir, { recursive: true, force: true });
  }

  async listFiles(siteId: string, scope: string): Promise<SiteFileEntry[]> {
    const baseDir = this.resolveScopeDir(siteId, scope);
    try {
      await fs.access(baseDir);
    } catch {
      return [];
    }

    const results: SiteFileEntry[] = [];
    async function walk(currentDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const stat = await fs.stat(full);
          const rel = path.relative(baseDir, full).split(path.sep).join('/');
          results.push({
            path: rel,
            sizeBytes: stat.size,
            isText: isTextEditable(rel),
            mimeType: getMimeType(rel),
          });
        }
      }
    }

    await walk(baseDir);
    results.sort((a, b) => a.path.localeCompare(b.path));
    return results;
  }

  async readFile(siteId: string, scope: string, relPath: string): Promise<Buffer | null> {
    const baseDir = this.resolveScopeDir(siteId, scope);
    let target: string;
    try {
      target = this.resolveSafeTarget(baseDir, relPath);
    } catch {
      return null;
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) return null;
      return await fs.readFile(target);
    } catch {
      return null;
    }
  }

  async writeDraftFile(siteId: string, relPath: string, content: Buffer): Promise<void> {
    const draftDir = this.resolveScopeDir(siteId, 'draft');
    await fs.mkdir(draftDir, { recursive: true });
    const target = this.resolveSafeTarget(draftDir, relPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }

  async deleteDraftFile(siteId: string, relPath: string): Promise<boolean> {
    const draftDir = this.resolveScopeDir(siteId, 'draft');
    const target = this.resolveSafeTarget(draftDir, relPath);
    try {
      await fs.unlink(target);
      return true;
    } catch {
      return false;
    }
  }

  async snapshotDraftAsVersion(
    siteId: string,
    newVersionId: string
  ): Promise<{ fileCount: number; totalSizeBytes: number }> {
    const draftDir = this.resolveScopeDir(siteId, 'draft');
    const verDir = this.resolveScopeDir(siteId, newVersionId);
    await fs.rm(verDir, { recursive: true, force: true });
    await fs.mkdir(verDir, { recursive: true });
    await fs.cp(draftDir, verDir, { recursive: true, force: true });

    const files = await this.listFiles(siteId, newVersionId);
    const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
    return { fileCount: files.length, totalSizeBytes };
  }

  async deleteSiteStorage(siteId: string): Promise<void> {
    const safeSite = siteId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeSite) return;
    const siteDir = path.resolve(DATA_ROOT, safeSite);
    await fs.rm(siteDir, { recursive: true, force: true });
  }

  async getDiskUsageBytes(): Promise<number> {
    try {
      await fs.access(DATA_ROOT);
    } catch {
      return 0;
    }
    let total = 0;
    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.isFile()) {
          const stat = await fs.stat(full);
          total += stat.size;
        }
      }
    }
    await walk(DATA_ROOT);
    return total;
  }
}

export function createStorageProvider(): StorageProvider {
  // Architecture supports swapping in Cloudflare R2 / S3-compatible provider via env vars
  // without refactoring handlers or site routing.
  return new LocalDiskStorageProvider();
}
