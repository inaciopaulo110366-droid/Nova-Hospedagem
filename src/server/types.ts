export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type SiteStatus = 'online' | 'suspended' | 'blocked';
export type DeploymentStatus = 'published' | 'archived' | 'removed';
export type DeploymentSourceType = 'zip' | 'html' | 'editor' | 'files';

export interface UserRecord {
  uid: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
}

export interface SiteRecord {
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
}

export interface DeploymentRecord {
  id: string;
  siteId: string;
  ownerId: string;
  versionNumber: number;
  status: DeploymentStatus;
  sourceType: DeploymentSourceType;
  sizeBytes: number;
  fileCount: number;
  entryFile: string;
  notes: string;
  createdAt: string;
}

export interface SiteFileEntry {
  path: string;
  sizeBytes: number;
  isText: boolean;
  mimeType: string;
}

export interface SiteAnalyticsRecord {
  totalVisits: number;
  dailyVisits: Record<string, number>;
  pageHits: Record<string, number>;
  referrers: Record<string, number>;
  lastVisitAt: string | null;
}

export interface SecurityLogRecord {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'critical';
  category: 'auth' | 'upload' | 'security' | 'admin' | 'domain';
  uid: string | null;
  ip: string;
  message: string;
  meta?: Record<string, string | number | boolean>;
}

export interface AbuseReportRecord {
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

export interface AnnouncementRecord {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'maintenance';
  active: boolean;
  createdAt: string;
}

export interface PlatformLimits {
  maxSitesPerUser: number;
  maxSiteSizeMb: number;
  allowSignups: boolean;
  maintenanceMode: boolean;
  primaryDomain: string;
  updatedAt: string;
}

export interface LocalCredentialRecord {
  uid: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStoreData {
  users: Record<string, UserRecord>;
  sites: Record<string, SiteRecord>;
  deployments: Record<string, DeploymentRecord[]>;
  analytics: Record<string, SiteAnalyticsRecord>;
  securityLogs: SecurityLogRecord[];
  reports: AbuseReportRecord[];
  announcements: AnnouncementRecord[];
  limits: PlatformLimits;
  localCredentials?: Record<string, LocalCredentialRecord>;
  sessionSecret?: string;
}
