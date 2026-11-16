import { auth } from './firebase';

const LOCAL_SESSION_KEY = 'nh_local_session_token';

export function getLocalSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(LOCAL_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setLocalSessionToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(LOCAL_SESSION_KEY, token);
    } else {
      window.localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    return currentUser.getIdToken();
  }
  return getLocalSessionToken();
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = await getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const errMsg =
      (data && typeof data.error === 'string' && data.error) ||
      `Erro na solicitação (HTTP ${response.status}).`;
    throw new Error(errMsg);
  }

  return data as T;
}

export async function downloadSiteZip(
  siteId: string,
  slug: string,
  scope?: 'live' | 'draft'
): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const response = await fetch(`/api/sites/${encodeURIComponent(siteId)}/export-zip${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    const errData = contentType.includes('application/json') ? await response.json() : null;
    throw new Error(
      (errData && typeof errData.error === 'string' && errData.error) ||
        `Não foi possível gerar o arquivo ZIP (HTTP ${response.status}).`
    );
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `${slug}-netlify.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatShortDateBR(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}`;
}

export function buildLiveSiteUrl(slug: string, appOrigin?: string): string {
  const origin =
    appOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/sites/${slug}/`;
}

export function buildPrimarySubdomainUrl(slug: string, primaryDomain = 'nh.com.br'): string {
  return `https://${slug}.${primaryDomain}`;
}
