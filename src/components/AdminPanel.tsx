import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Users,
  Globe,
  Sliders,
  Megaphone,
  Server,
  Search,
  Ban,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Download,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, buildLiveSiteUrl, formatBytes, formatDateBR, getAuthToken } from '../lib/api';
import type { AdminOverviewData, SiteStatus } from '../types/platform';

interface AdminPanelProps {
  appOrigin: string;
  onLimitsUpdated: () => void;
}

type AdminSubTab = 'users' | 'sites' | 'limits' | 'moderation' | 'infra';

export function AdminPanel({ appOrigin, onLimitsUpdated }: AdminPanelProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>('users');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Limits form
  const [maxSites, setMaxSites] = useState(3);
  const [maxSizeMb, setMaxSizeMb] = useState(100);
  const [allowSignups, setAllowSignups] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annSeverity, setAnnSeverity] = useState<'info' | 'warning' | 'maintenance'>('info');

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
      setData(res);
      setMaxSites(res.limits.maxSitesPerUser);
      setMaxSizeMb(res.limits.maxSiteSizeMb);
      setAllowSignups(res.limits.allowSignups);
      setMaintenanceMode(res.limits.maintenanceMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados administrativos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const handleToggleUserStatus = async (uid: string, nextStatus: 'active' | 'suspended') => {
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/users/${uid}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(`Status do usuário atualizado para ${nextStatus}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    }
  };

  const handleSiteStatus = async (siteId: string, status: SiteStatus) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/sites/${siteId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setFeedback(`Status do site atualizado para ${status}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status do site.');
    }
  };

  const handleDeleteSite = async (siteId: string, slug: string) => {
    setFeedback(null);
    try {
      await apiFetch(`/api/admin/sites/${siteId}`, { method: 'DELETE' });
      setFeedback(`Site ${slug}.nh.com.br removido permanentemente.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir site.');
    }
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/admin/limits', {
        method: 'PUT',
        body: JSON.stringify({
          maxSitesPerUser: Number(maxSites),
          maxSiteSizeMb: Number(maxSizeMb),
          allowSignups,
          maintenanceMode,
        }),
      });
      setFeedback('Limites gratuitos e configurações gerais atualizados.');
      onLimitsUpdated();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar limites.');
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await apiFetch('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: annTitle,
          message: annMessage,
          severity: annSeverity,
        }),
      });
      setAnnTitle('');
      setAnnMessage('');
      setFeedback('Aviso publicado para toda a plataforma.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar aviso.');
    }
  };

  const handleToggleAnnouncement = async (id: string, active: boolean) => {
    await apiFetch(`/api/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    await loadOverview();
  };

  const handleDeleteAnnouncement = async (id: string) => {
    await apiFetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    await loadOverview();
  };

  const handleReportStatus = async (reportId: string, status: 'resolved' | 'dismissed') => {
    await apiFetch(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await loadOverview();
  };

  const handleDownloadBackup = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const resp = await fetch('/api/admin/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `novahospeda-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Falha ao exportar backup.');
    }
  };

  const filteredUsers = (data?.users || []).filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSites = (data?.sites || []).filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.ownerEmail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Administração da Plataforma
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Controle de contas, moderação de subdomínios, cotas gratuitas, denúncias e logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadBackup()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Backup
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'users', label: `Usuários (${data?.users.length ?? 0})`, icon: Users },
            { id: 'sites', label: `Sites (${data?.sites.length ?? 0})`, icon: Globe },
            { id: 'limits', label: 'Limites gratuitos', icon: Sliders },
            {
              id: 'moderation',
              label: `Denúncias & Avisos (${data?.reports.filter((r) => r.status === 'open').length ?? 0})`,
              icon: Megaphone,
            },
            { id: 'infra', label: 'Infraestrutura & Logs', icon: Server },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                subTab === item.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-800 dark:text-emerald-300">
          {feedback}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {(subTab === 'users' || subTab === 'sites') && (
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por e-mail, nome ou subdomínio..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>
      )}

      {subTab === 'users' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Usuário</th>
                <th className="px-5 py-3 font-medium">E-mail</th>
                <th className="px-5 py-3 font-medium text-right">Sites</th>
                <th className="px-5 py-3 font-medium text-right">Armazenamento</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredUsers.map((u) => (
                <tr key={u.uid}>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                    {u.displayName}
                    {u.role === 'admin' && (
                      <span className="ml-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {u.email}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                    {u.sitesCount ?? 0}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                    {formatBytes(u.storageUsedBytes ?? 0)}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {u.status === 'active' ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Ativa
                      </span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        Suspensa
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {u.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleToggleUserStatus(
                            u.uid,
                            u.status === 'active' ? 'suspended' : 'active'
                          )
                        }
                        className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {u.status === 'active' ? 'Suspender' : 'Reativar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'sites' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Site</th>
                <th className="px-5 py-3 font-medium">Subdomínio</th>
                <th className="px-5 py-3 font-medium">Proprietário</th>
                <th className="px-5 py-3 font-medium text-right">Tamanho</th>
                <th className="px-5 py-3 font-medium text-right">Visitas</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Moderação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredSites.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                    {s.name}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs">
                    <a
                      href={buildLiveSiteUrl(s.slug, appOrigin)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      {s.slug}.nh.com.br <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                    {s.ownerEmail}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                    {formatBytes(s.totalSizeBytes)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono tabular-nums">
                    {s.totalVisits ?? 0}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-medium">
                    {s.status === 'online' && <span className="text-emerald-600">Online</span>}
                    {s.status === 'suspended' && <span className="text-amber-600">Suspenso</span>}
                    {s.status === 'blocked' && <span className="text-red-600">Bloqueado</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    {s.status !== 'blocked' ? (
                      <button
                        type="button"
                        onClick={() => void handleSiteStatus(s.id, 'blocked')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline"
                      >
                        <Ban className="w-3.5 h-3.5" /> Bloquear
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSiteStatus(s.id, 'online')}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Desbloquear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteSite(s.id, s.slug)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'limits' && (
        <form
          onSubmit={handleSaveLimits}
          className="max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Configurar plano gratuito e regras gerais
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Máximo de sites por usuário
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxSites}
                onChange={(e) => setMaxSites(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Limite por site (MB)
              </label>
              <input
                type="number"
                min={1}
                max={2048}
                value={maxSizeMb}
                onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowSignups}
                onChange={(e) => setAllowSignups(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Permitir criação de novas contas gratuitas
            </label>

            <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="rounded border-slate-300 text-blue-700"
              />
              Ativar modo de manutenção para novos envios
            </label>
          </div>

          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold"
          >
            Salvar configurações
          </button>
        </form>
      )}

      {subTab === 'moderation' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Denúncias recebidas ({data?.reports.length ?? 0})
            </h3>
            {data && data.reports.length > 0 ? (
              <div className="space-y-3">
                {data.reports.map((r) => (
                  <div
                    key={r.id}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {r.siteSlug}.nh.com.br
                      </span>
                      <span className="text-slate-500">{formatDateBR(r.createdAt)}</span>
                    </div>
                    <p className="font-medium text-red-700 dark:text-red-400">{r.reason}</p>
                    <p className="text-slate-600 dark:text-slate-400">{r.details}</p>
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-slate-400">Status: {r.status}</span>
                      {r.status === 'open' && (
                        <div className="space-x-2">
                          <button
                            type="button"
                            onClick={() => void handleReportStatus(r.id, 'resolved')}
                            className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline"
                          >
                            Marcar resolvida
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleReportStatus(r.id, 'dismissed')}
                            className="text-slate-500 hover:underline"
                          >
                            Arquivar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhuma denúncia registrada até o momento.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Avisos da plataforma
            </h3>
            <form onSubmit={handleCreateAnnouncement} className="space-y-3">
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Título do aviso"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
              <textarea
                required
                rows={3}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="Mensagem exibida no painel e página inicial"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
              <div className="flex items-center justify-between gap-3">
                <select
                  value={annSeverity}
                  onChange={(e) => setAnnSeverity(e.target.value as 'info' | 'warning' | 'maintenance')}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                >
                  <option value="info">Informativo</option>
                  <option value="warning">Alerta</option>
                  <option value="maintenance">Manutenção</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                >
                  Publicar aviso
                </button>
              </div>
            </form>

            <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              {(data?.announcements || []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{a.title}</p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{a.message}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleAnnouncement(a.id, !a.active)}
                      className="text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      {a.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteAnnouncement(a.id)}
                      className="text-red-600 hover:underline"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'infra' && data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <span className="text-xs text-slate-500">Armazenamento em disco</span>
              <p className="text-lg font-bold font-mono tabular-nums mt-1">
                {formatBytes(data.infrastructure.diskUsageBytes)}
              </p>
              <span className="text-xs text-slate-400">Driver: {data.infrastructure.storageDriver}</span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <span className="text-xs text-slate-500">Memória do processo</span>
              <p className="text-lg font-bold font-mono tabular-nums mt-1">
                {formatBytes(data.infrastructure.rssBytes)}
              </p>
              <span className="text-xs text-slate-400">Heap: {formatBytes(data.infrastructure.heapUsedBytes)}</span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <span className="text-xs text-slate-500">Tempo ativo do servidor</span>
              <p className="text-lg font-bold font-mono tabular-nums mt-1">
                {Math.floor(data.infrastructure.uptimeSeconds / 60)} min
              </p>
              <span className="text-xs text-slate-400">{data.infrastructure.nodeVersion}</span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <span className="text-xs text-slate-500">Visitas totais na rede</span>
              <p className="text-lg font-bold font-mono tabular-nums mt-1">
                {data.infrastructure.totalVisitsAll.toLocaleString('pt-BR')}
              </p>
              <span className="text-xs text-slate-400">{data.infrastructure.platform}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-blue-700 dark:text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Logs de segurança e auditoria
              </h3>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {data.securityLogs.map((log) => (
                <div key={log.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-mono text-slate-400 mr-2">{formatDateBR(log.timestamp)}</span>
                    <span
                      className={`font-semibold mr-2 ${
                        log.level === 'critical'
                          ? 'text-red-600'
                          : log.level === 'warning'
                          ? 'text-amber-600'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      [{log.category}]
                    </span>
                    <span className="text-slate-800 dark:text-slate-200">{log.message}</span>
                  </div>
                  <span className="font-mono text-slate-400">{log.ip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
