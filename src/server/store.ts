import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PRIMARY_DOMAIN } from './security.ts';
import type {
  AbuseReportRecord,
  AnnouncementRecord,
  DeploymentRecord,
  PlatformLimits,
  PlatformStoreData,
  SecurityLogRecord,
  SiteAnalyticsRecord,
  SiteRecord,
  UserRecord,
} from './types.ts';

const STORE_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.resolve(STORE_DIR, 'platform-store.json');

function createInitialStore(): PlatformStoreData {
  return {
    users: {},
    sites: {},
    deployments: {},
    analytics: {},
    securityLogs: [],
    reports: [],
    announcements: [],
    localCredentials: {},
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    limits: {
      maxSitesPerUser: 3,
      maxSiteSizeMb: 100,
      allowSignups: true,
      maintenanceMode: false,
      primaryDomain: PRIMARY_DOMAIN,
      updatedAt: new Date().toISOString(),
    },
  };
}

let cachedStore: PlatformStoreData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function getStore(): PlatformStoreData {
  if (cachedStore) return cachedStore;

  fs.mkdirSync(STORE_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    try {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PlatformStoreData>;
      const base = createInitialStore();
      let dirty = false;
      const sessionSecret =
        typeof parsed.sessionSecret === 'string' && parsed.sessionSecret.length >= 32
          ? parsed.sessionSecret
          : ((dirty = true), base.sessionSecret);
      cachedStore = {
        users: parsed.users || base.users,
        sites: parsed.sites || base.sites,
        deployments: parsed.deployments || base.deployments,
        analytics: parsed.analytics || base.analytics,
        securityLogs: Array.isArray(parsed.securityLogs) ? parsed.securityLogs : [],
        reports: Array.isArray(parsed.reports) ? parsed.reports : [],
        announcements: Array.isArray(parsed.announcements) ? parsed.announcements : [],
        localCredentials: parsed.localCredentials || {},
        sessionSecret,
        limits: {
          ...base.limits,
          ...(parsed.limits || {}),
          primaryDomain: PRIMARY_DOMAIN,
        },
      };
      if (dirty) {
        fs.writeFileSync(STORE_FILE, JSON.stringify(cachedStore, null, 2), 'utf8');
      }
      return cachedStore;
    } catch (err) {
      console.error('Failed to parse platform-store.json, initializing fresh store:', err);
    }
  }

  cachedStore = createInitialStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(cachedStore, null, 2), 'utf8');
  return cachedStore;
}

export async function persistStore(): Promise<void> {
  const store = getStore();
  writeQueue = writeQueue.then(async () => {
    await fsp.mkdir(STORE_DIR, { recursive: true });
    const tmpFile = `${STORE_FILE}.tmp.${process.pid}`;
    await fsp.writeFile(tmpFile, JSON.stringify(store, null, 2), 'utf8');
    await fsp.rename(tmpFile, STORE_FILE);
  });
  return writeQueue;
}

export function addSecurityLog(
  entry: Omit<SecurityLogRecord, 'id' | 'timestamp'>
): SecurityLogRecord {
  const store = getStore();
  const record: SecurityLogRecord = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  store.securityLogs.unshift(record);
  if (store.securityLogs.length > 500) {
    store.securityLogs.length = 500;
  }
  void persistStore();
  return record;
}

export function recordRealVisit(siteId: string, pagePath: string, referrer: string): void {
  const store = getStore();
  if (!store.analytics[siteId]) {
    store.analytics[siteId] = {
      totalVisits: 0,
      dailyVisits: {},
      pageHits: {},
      referrers: {},
      lastVisitAt: null,
    };
  }
  const stats = store.analytics[siteId];
  const day = new Date().toISOString().slice(0, 10);

  stats.totalVisits += 1;
  stats.dailyVisits[day] = (stats.dailyVisits[day] || 0) + 1;
  const cleanPage = pagePath || '/';
  stats.pageHits[cleanPage] = (stats.pageHits[cleanPage] || 0) + 1;

  let refHost = 'Acesso direto';
  if (referrer) {
    try {
      refHost = new URL(referrer).hostname || 'Acesso direto';
    } catch {
      refHost = 'Acesso direto';
    }
  }
  stats.referrers[refHost] = (stats.referrers[refHost] || 0) + 1;
  stats.lastVisitAt = new Date().toISOString();

  // Keep dailyVisits bounded to last 365 days
  const keys = Object.keys(stats.dailyVisits).sort();
  if (keys.length > 365) {
    for (const oldKey of keys.slice(0, keys.length - 365)) {
      delete stats.dailyVisits[oldKey];
    }
  }

  void persistStore();
}

export function findSiteBySlug(slug: string): SiteRecord | undefined {
  const store = getStore();
  const lower = slug.toLowerCase();
  return Object.values(store.sites).find((s) => s.slug.toLowerCase() === lower);
}

export function findUserSites(uid: string): SiteRecord[] {
  const store = getStore();
  return Object.values(store.sites)
    .filter((s) => s.ownerId === uid)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getUserStorageUsed(uid: string): number {
  return findUserSites(uid).reduce((sum, s) => sum + s.totalSizeBytes, 0);
}

export type {
  AbuseReportRecord,
  AnnouncementRecord,
  DeploymentRecord,
  PlatformLimits,
  SiteAnalyticsRecord,
  SiteRecord,
  UserRecord,
};
