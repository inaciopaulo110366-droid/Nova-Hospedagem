export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type SiteStatus = 'online' | 'suspended' | 'blocked';

export interface PlatformLimits {
  maxSitesPerUser: number;
  maxSiteSizeMb: number;
  allowSignups: boolean;
  maintenanceMode: boolean;
  primaryDomain: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  sitesCount?: number;
  storageUsedBytes?: number;
}

export interface SiteItem {
  id: string;
  ownerId: string;
  ownerEmail: string;
  name: string;
  slug: string;
  customDomain: string;
  status: SiteStatus;
  currentVersionId: string | null;
  draftVersionId: string | null;
  versionCount: number;
  totalSizeBytes: number;
  fileCount: number;
  entryFile: string;
  sslEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastPublishedAt: string | null;
  totalVisits?: number;
  lastVisitAt?: string | null;
  deploymentsCount?: number;
}

export interface DeploymentItem {
  id: string;
  siteId: string;
  ownerId: string;
  versionNumber: number;
  status: 'published' | 'archived' | 'removed';
  sourceType: 'zip' | 'html' | 'editor' | 'files';
  sizeBytes: number;
  fileCount: number;
  entryFile: string;
  notes: string;
  createdAt: string;
}

export interface SiteFile {
  path: string;
  sizeBytes: number;
  isText: boolean;
  mimeType: string;
}

export interface DailyVisitPoint {
  date: string;
  visits: number;
}

export interface AnalyticsOverview {
  totalVisits: number;
  totalStorageBytes: number;
  sitesCount: number;
  dailySeries: DailyVisitPoint[];
  topSites: Array<{
    id: string;
    name: string;
    slug: string;
    visits: number;
    sizeBytes: number;
    status: SiteStatus;
  }>;
}

export interface SiteAnalytics {
  totalVisits: number;
  lastVisitAt: string | null;
  dailySeries: DailyVisitPoint[];
  topPages: Array<{ page: string; hits: number }>;
  topReferrers: Array<{ source: string; hits: number }>;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'maintenance';
  active: boolean;
  createdAt: string;
}

export interface AbuseReportItem {
  id: string;
  siteSlug: string;
  siteId: string | null;
  reason: string;
  details: string;
  reporterEmail: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt: string | null;
}

export interface SecurityLogItem {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'critical';
  category: 'auth' | 'upload' | 'security' | 'admin' | 'domain';
  uid: string | null;
  ip: string;
  message: string;
}

export interface AdminOverviewData {
  users: UserProfile[];
  sites: SiteItem[];
  reports: AbuseReportItem[];
  announcements: AnnouncementItem[];
  securityLogs: SecurityLogItem[];
  limits: PlatformLimits;
  infrastructure: {
    storageDriver: string;
    diskUsageBytes: number;
    heapUsedBytes: number;
    rssBytes: number;
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    totalVisitsAll: number;
  };
}

export interface DomainSuggestion {
  slug: string;
  fullDomain: string;
  isExactMatch: boolean;
}

export interface AiDiagnosticItem {
  file: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AiFilePatch {
  path: string;
  reason: string;
  fixedContent: string;
}

export interface AiFixResponse {
  summary: string;
  diagnostics: AiDiagnosticItem[];
  patches: AiFilePatch[];
}

export type DashboardTab =
  | 'overview'
  | 'sites'
  | 'create'
  | 'deployments'
  | 'editor'
  | 'analytics'
  | 'storage'
  | 'settings'
  | 'help'
  | 'admin';
