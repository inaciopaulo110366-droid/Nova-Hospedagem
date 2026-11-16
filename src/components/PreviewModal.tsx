import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Code2,
  Sparkles,
  Rocket,
  AlertCircle,
  FilePlus2,
  UploadCloud,
  Copy,
  Check,
  Info,
  Download,
} from 'lucide-react';
import { apiFetch, buildLiveSiteUrl, downloadSiteZip } from '../lib/api';
import type { SiteItem } from '../types/platform';

interface PreviewModalProps {
  site: SiteItem;
  primaryDomain: string;
  appOrigin: string;
  initialScope?: 'draft' | 'live';
  onClose: () => void;
  onOpenEditor: (siteId: string, openAiPanel?: boolean) => void;
  onOpenUpload?: (site: SiteItem) => void;
  onPublished: () => void;
}

interface PreviewTokenResponse {
  token: string;
  previewPath: string;
  hasDraftFiles: boolean;
  hasLiveFiles: boolean;
}

export function PreviewModal({
  site,
  primaryDomain,
  appOrigin,
  initialScope,
  onClose,
  onOpenEditor,
  onOpenUpload,
  onPublished,
}: PreviewModalProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobile' : 'desktop'
  );
  const [scope, setScope] = useState<'draft' | 'live'>(
    initialScope ?? (site.currentVersionId ? 'live' : 'draft')
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isEmptySite, setIsEmptySite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingStarter, setCreatingStarter] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDevSandbox =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');
  const liveExternalUrl = buildLiveSiteUrl(site.slug, appOrigin);

  useEffect(() => {
    setScope(initialScope ?? (site.currentVersionId ? 'live' : 'draft'));
  }, [site.id, site.currentVersionId, initialScope]);

  const loadPreview = useCallback(
    async (targetScope: 'draft' | 'live') => {
      setLoading(true);
      setError(null);
      setIsEmptySite(false);
      try {
        if (targetScope === 'live' && site.currentVersionId) {
          setPreviewUrl(`/sites/${encodeURIComponent(site.slug)}/?preview_ts=${Date.now()}`);
          return;
        }

        const res = await apiFetch<PreviewTokenResponse>(`/api/sites/${site.id}/preview-token`);
        if (!res.hasDraftFiles && !res.hasLiveFiles) {
          setPreviewUrl(null);
          setIsEmptySite(true);
          return;
        }
        const basePath =
          res.previewPath || `/p/${encodeURIComponent(res.token)}/${site.id}/draft/`;
        setPreviewUrl(`${basePath}?t=${Date.now()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar pré-visualização.');
      } finally {
        setLoading(false);
      }
    },
    [site.id, site.slug, site.currentVersionId]
  );

  useEffect(() => {
    void loadPreview(scope);
  }, [scope, loadPreview]);

  const handleCreateStarter = async () => {
    setCreatingStarter(true);
    setError(null);
    try {
      await apiFetch(`/api/sites/${site.id}/starter`, {
        method: 'POST',
        body: JSON.stringify({ name: site.name }),
      });
      setScope('draft');
      await loadPreview('draft');
      onPublished();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar página inicial.');
    } finally {
      setCreatingStarter(false);
    }
  };

  const handlePublishDraft = async () => {
    setPublishing(true);
    setError(null);
    try {
      await apiFetch(`/api/sites/${site.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Publicado após pré-visualização' }),
      });
      onPublished();
      setScope('live');
      await loadPreview('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar rascunho.');
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyLiveUrl = async () => {
    await navigator.clipboard.writeText(liveExternalUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  const frameClass =
    viewport === 'desktop'
      ? 'w-full h-full min-h-[360px]'
      : viewport === 'tablet'
      ? 'w-[768px] shrink-0 h-full min-h-[420px]'
      : 'w-full max-w-[390px] h-full min-h-[420px]';

  return (
    <div
      className="fixed inset-0 h-dvh w-screen z-50 flex flex-col bg-slate-950/85 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex-1 min-h-0 flex flex-col sm:rounded-xl border-0 sm:border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xl">
        {/* Top Toolbar (Compact Mobile + Desktop) */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 sm:px-4 sm:py-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          {/* Row 1: Title + Primary Actions + Close */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Preview: {site.name}
              </h2>
              <p className="text-[11px] sm:text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                {site.slug}.{primaryDomain}
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:hidden shrink-0">
              {scope === 'draft' && !isEmptySite && (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void handlePublishDraft()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  {publishing ? '...' : 'Publicar'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar preview"
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Row 2 (Mobile) / Center+Right (Desktop): Scope + Viewport + Actions */}
          <div className="flex items-center justify-between sm:justify-end gap-2 overflow-x-auto pb-0.5 sm:pb-0">
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setScope('draft')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  scope === 'draft'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Rascunho
              </button>
              <button
                type="button"
                disabled={!site.currentVersionId}
                onClick={() => setScope('live')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 whitespace-nowrap ${
                  scope === 'live'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                No ar
              </button>
            </div>

            {/* Viewport Switcher */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                title="Celular"
                className={`p-1.5 rounded-md transition-colors ${
                  viewport === 'mobile'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                title="Tablet"
                className={`p-1.5 rounded-md transition-colors ${
                  viewport === 'tablet'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Tablet className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                title="Desktop"
                className={`p-1.5 rounded-md transition-colors ${
                  viewport === 'desktop'
                    ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void loadPreview(scope)}
                title="Recarregar preview"
                className="p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditor(site.id, true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/60 whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>IA</span>
                <span className="hidden md:inline">Corrigir erros</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditor(site.id, false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Editor</span>
              </button>

              {scope === 'draft' && !isEmptySite && (
                <button
                  type="button"
                  disabled={publishing}
                  onClick={() => void handlePublishDraft()}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  {publishing ? 'Publicando...' : 'Publicar'}
                </button>
              )}

              {!isEmptySite && (
                <button
                  type="button"
                  disabled={downloadingZip}
                  onClick={() => {
                    setDownloadingZip(true);
                    setError(null);
                    void downloadSiteZip(site.id, site.slug, scope)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao baixar ZIP.'))
                      .finally(() => setDownloadingZip(false));
                  }}
                  title="Baixar arquivo .ZIP pronto para publicar no Netlify Drop"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 sm:py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingZip ? 'ZIP...' : 'ZIP Netlify'}</span>
                </button>
              )}

              {site.currentVersionId && (
                <button
                  type="button"
                  onClick={() => void handleCopyLiveUrl()}
                  title="Copiar URL pública do site"
                  className="p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                >
                  {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              )}

              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir em nova aba (funciona em navegadores externos quando publicado em produção)"
                  className="p-1.5 sm:p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar preview"
                className="hidden sm:inline-flex p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {isDevSandbox && scope === 'live' && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-900 px-3 sm:px-4 py-2 flex items-start gap-2 text-[11px] sm:text-xs text-blue-900 dark:text-blue-200">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-700 dark:text-blue-400" />
            <span>
              Modo de desenvolvimento privado (<span className="font-mono">ais-dev</span>): o site publicado abre diretamente abaixo. Links externos em nova aba ou fora deste app só ficam públicos após publicar/compartilhar o aplicativo em produção ou apontar o DNS de <span className="font-mono">{primaryDomain}</span>.
            </span>
          </div>
        )}

        {/* Viewport Container */}
        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-950 p-2 sm:p-5 overflow-auto flex flex-col items-center">
          {error ? (
            <div className="m-auto max-w-md w-full rounded-xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
              <AlertCircle className="w-6 h-6 text-red-600 mx-auto" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => void loadPreview(scope)}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
              >
                Tentar novamente
              </button>
            </div>
          ) : isEmptySite ? (
            <div className="m-auto max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-4">
              <FilePlus2 className="w-8 h-8 text-blue-700 dark:text-blue-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Este site ainda não possui arquivos
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Gere uma página inicial pronta (HTML + CSS + JS) agora para visualizar e editar, ou envie seus próprios arquivos.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={creatingStarter}
                  onClick={() => void handleCreateStarter()}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {creatingStarter
                    ? 'Gerando página inicial...'
                    : 'Gerar página inicial pronta e abrir Preview'}
                </button>
                {onOpenUpload && (
                  <button
                    type="button"
                    onClick={() => onOpenUpload(site)}
                    className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Enviar ZIP ou HTML
                  </button>
                )}
              </div>
            </div>
          ) : previewUrl ? (
            <div
              className={`bg-white rounded-lg border border-slate-300 dark:border-slate-700 shadow-lg overflow-hidden transition-all duration-200 flex flex-col flex-1 ${frameClass}`}
            >
              <iframe
                key={previewUrl}
                title={`Preview ao vivo de ${site.name}`}
                src={previewUrl}
                className="w-full h-full flex-1 border-0 bg-white"
              />
            </div>
          ) : (
            <div className="m-auto text-sm text-slate-500">Carregando preview...</div>
          )}
        </div>
      </div>
    </div>
  );
}
