import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Globe, HardDrive, ArrowUpRight, RefreshCw } from 'lucide-react';
import { apiFetch, buildLiveSiteUrl, formatBytes, formatDateBR, formatShortDateBR } from '../lib/api';
import type { AnalyticsOverview, SiteAnalytics, SiteItem } from '../types/platform';

interface AnalyticsViewProps {
  sites: SiteItem[];
  appOrigin: string;
  onOpenSite?: (siteId: string) => void;
}

export function AnalyticsView({ sites, appOrigin, onOpenSite }: AnalyticsViewProps) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [siteDetail, setSiteDetail] = useState<SiteAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const ov = await apiFetch<AnalyticsOverview>(`/api/analytics/overview?days=${days}`);
      setOverview(ov);

      if (selectedSiteId !== 'all') {
        const detail = await apiFetch<SiteAnalytics>(
          `/api/sites/${selectedSiteId}/analytics?days=${days}`
        );
        setSiteDetail(detail);
      } else {
        setSiteDetail(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [days, selectedSiteId]);

  const activeSeries =
    selectedSiteId === 'all'
      ? overview?.dailySeries || []
      : siteDetail?.dailySeries || [];

  const chartData = activeSeries.map((pt) => ({
    label: formatShortDateBR(pt.date),
    date: pt.date,
    visits: pt.visits,
  }));

  const activeTotalVisits =
    selectedSiteId === 'all'
      ? overview?.totalVisits || 0
      : siteDetail?.totalVisits || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Estatísticas reais de visitas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Acessos contabilizados diretamente pelas requisições HTML nos seus sites publicados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100"
          >
            <option value="all">Todos os meus sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug}.nh.com.br)
              </option>
            ))}
          </select>

          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  days === d
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {d} dias
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            aria-label="Atualizar estatísticas"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Visitas totais registradas</span>
            <BarChart3 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {activeTotalVisits.toLocaleString('pt-BR')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Projetos ativos</span>
            <Globe className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {overview?.sitesCount ?? sites.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Espaço total utilizado</span>
            <HardDrive className="w-4 h-4 text-blue-700 dark:text-blue-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBytes(overview?.totalStorageBytes || 0)}
          </p>
        </div>
      </div>

      {/* Daily Visits Chart */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Visitas por dia (últimos {days} dias)
          </h3>
          {siteDetail?.lastVisitAt && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Último acesso: {formatDateBR(siteDetail.lastVisitAt)}
            </span>
          )}
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="nhVisitsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-15" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
                formatter={(value) => [`${Number(value ?? 0)} visita(s)`, 'Acessos']}
              />
              <Area
                type="monotone"
                dataKey="visits"
                stroke="#1d4ed8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#nhVisitsGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Breakdown */}
      {selectedSiteId === 'all' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Sites mais acessados
            </h3>
          </div>
          {overview && overview.topSites.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-3 font-medium">Projeto</th>
                    <th className="px-6 py-3 font-medium">Subdomínio</th>
                    <th className="px-6 py-3 font-medium text-right">Tamanho</th>
                    <th className="px-6 py-3 font-medium text-right">Visitas</th>
                    <th className="px-6 py-3 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {overview.topSites.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-3.5 font-medium text-slate-900 dark:text-slate-100">
                        {s.name}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {s.slug}.nh.com.br
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        {formatBytes(s.sizeBytes)}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {s.visits.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        {onOpenSite ? (
                          <button
                            type="button"
                            onClick={() => onOpenSite(s.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Abrir <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <a
                            href={buildLiveSiteUrl(s.slug, appOrigin)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                          >
                            Abrir <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Publique um site e compartilhe o link para começar a registrar visitas reais.
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Páginas mais acessadas
            </h3>
            {siteDetail && siteDetail.topPages.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {siteDetail.topPages.map((p) => (
                  <li key={p.page} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
                      {p.page}
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {p.hits}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 py-4">Ainda não há acessos registrados.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Origens de tráfego (Referrers)
            </h3>
            {siteDetail && siteDetail.topReferrers.length > 0 ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {siteDetail.topReferrers.map((r) => (
                  <li key={r.source} className="py-2.5 flex items-center justify-between gap-2">
                    <span className="text-slate-700 dark:text-slate-300 truncate">{r.source}</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {r.hits}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500 py-4">Ainda não há origens registradas.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
