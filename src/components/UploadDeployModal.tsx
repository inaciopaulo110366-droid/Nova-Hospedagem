import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileArchive,
  FileCode2,
  X,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Copy,
  Check,
  FolderUp,
  Download,
} from 'lucide-react';
import { buildLiveSiteUrl, buildPrimarySubdomainUrl, downloadSiteZip, formatBytes, getAuthToken } from '../lib/api';
import type { DeploymentItem, SiteItem } from '../types/platform';

interface UploadDeployModalProps {
  site: SiteItem;
  maxSiteSizeMb: number;
  primaryDomain: string;
  appOrigin: string;
  onClose: () => void;
  onSuccess: (updatedSite: SiteItem, deployment: DeploymentItem) => void;
  onOpenLiveSite?: (site: SiteItem) => void;
}

export function UploadDeployModal({
  site,
  maxSiteSizeMb,
  primaryDomain,
  appOrigin,
  onClose,
  onSuccess,
  onOpenLiveSite,
}: UploadDeployModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [autoPublish, setAutoPublish] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    site: SiteItem;
    deployment: DeploymentItem;
    strippedWrapperFolder: string | null;
    sourceOnlyWarning?: string | null;
    autoBuilt?: boolean;
    autoBuildNote?: string | null;
    skippedCount?: number;
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const totalSelectedBytes = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  const handleFilesAdded = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    const arr = Array.from(fileList);
    setSelectedFiles(arr);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFilesAdded(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setError('Selecione um arquivo ZIP, index.html ou arquivos estáticos do seu site.');
      return;
    }

    const maxBytes = maxSiteSizeMb * 1024 * 1024;
    if (totalSelectedBytes > maxBytes) {
      setError(`Os arquivos selecionados (${formatBytes(totalSelectedBytes)}) excedem o limite gratuito de ${maxSiteSizeMb} MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Sessão expirada. Faça login novamente.');

      const formData = new FormData();
      const relativePaths: string[] = [];

      for (const file of selectedFiles) {
        formData.append('files', file);
        const rel =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
          file.name;
        relativePaths.push(rel);
      }

      // If folder upload shares a single root wrapper folder, strip it cleanly
      let normalizedPaths = relativePaths;
      const splitPaths = relativePaths.map((p) => p.split('/').filter(Boolean));
      if (
        splitPaths.length > 0 &&
        splitPaths.every((parts) => parts.length > 1) &&
        new Set(splitPaths.map((parts) => parts[0])).size === 1
      ) {
        normalizedPaths = splitPaths.map((parts) => parts.slice(1).join('/'));
      }

      formData.append('relativePaths', JSON.stringify(normalizedPaths));
      formData.append('publish', autoPublish ? 'true' : 'false');
      if (notes.trim()) {
        formData.append('notes', notes.trim());
      }

      const data = await new Promise<{
        site: SiteItem;
        deployment: DeploymentItem;
        strippedWrapperFolder: string | null;
        sourceOnlyWarning?: string | null;
        autoBuilt?: boolean;
        autoBuildNote?: string | null;
        skippedCount?: number;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/sites/${site.id}/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const parsed = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.error || `Falha no envio (HTTP ${xhr.status})`));
            }
          } catch {
            reject(new Error('Resposta inválida do servidor durante o upload.'));
          }
        };

        xhr.onerror = () => reject(new Error('Falha de conexão ao enviar os arquivos.'));
        xhr.send(formData);
      });

      setResult(data);
      onSuccess(data.site, data.deployment);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado ao publicar arquivos.');
    } finally {
      setUploading(false);
    }
  };

  const liveUrl = buildLiveSiteUrl(site.slug, appOrigin);
  const subdomainUrl = buildPrimarySubdomainUrl(site.slug, primaryDomain);

  const copyLink = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {result ? 'Publicação concluída' : `Enviar arquivos — ${site.name}`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
              {site.slug}.{primaryDomain}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de upload"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {result ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                    Versão v{result.deployment.versionNumber} publicada automaticamente!
                  </p>
                  <p className="text-emerald-800 dark:text-emerald-300 text-xs">
                    {result.deployment.fileCount} arquivo(s) · {formatBytes(result.deployment.sizeBytes)} · Entrada:{' '}
                    <span className="font-mono">{result.deployment.entryFile}</span>
                  </p>
                  {result.strippedWrapperFolder && (
                    <p className="text-emerald-700 dark:text-emerald-400 text-xs">
                      Pasta raiz "{result.strippedWrapperFolder}/" detectada e ajustada automaticamente.
                    </p>
                  )}
                  {typeof result.skippedCount === 'number' && result.skippedCount > 0 && (
                    <p className="text-emerald-700 dark:text-emerald-400 text-xs">
                      {result.skippedCount} arquivo(s) de sistema/servidor ignorado(s) com segurança.
                    </p>
                  )}
                </div>
              </div>

              {result.autoBuilt && result.autoBuildNote && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 text-xs leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-blue-700 dark:text-blue-400" />
                  <span>{result.autoBuildNote}</span>
                </div>
              )}

              {result.sourceOnlyWarning && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{result.sourceOnlyWarning}</span>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
                <div>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Endereço publicado na plataforma
                  </span>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-mono font-medium text-slate-800 dark:text-slate-200 truncate">
                      {liveUrl}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void copyLink(liveUrl)}
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                        title="Copiar link"
                      >
                        {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir em nova aba (requer app publicado fora do sandbox de desenvolvimento)"
                        className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {onOpenLiveSite ? (
                        <button
                          type="button"
                          onClick={() => onOpenLiveSite(result.site)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          Abrir site
                        </button>
                      ) : (
                        <a
                          href={liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
                        >
                          Abrir site <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Subdomínio configurado na plataforma (via DNS wildcard *.{primaryDomain})
                  </span>
                  <p className="mt-1 text-xs font-mono text-slate-700 dark:text-slate-300">
                    {subdomainUrl}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={downloadingZip}
                  onClick={() => {
                    setDownloadingZip(true);
                    setError(null);
                    void downloadSiteZip(result.site.id, result.site.slug)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao baixar ZIP.'))
                      .finally(() => setDownloadingZip(false));
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  {downloadingZip ? 'Gerando ZIP...' : 'Baixar ZIP (Netlify)'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold"
                >
                  Concluir
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`rounded-xl border-2 border-dashed p-4 sm:p-6 text-center transition-colors ${
                  dragging
                    ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/30'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60'
                }`}
              >
                <UploadCloud className="w-8 h-8 sm:w-9 sm:h-9 mx-auto text-blue-700 dark:text-blue-400 mb-2.5" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Envie seu arquivo .ZIP, index.html ou arquivos do site
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  HTML, CSS, JS, TypeScript/React, imagens, fontes, áudio e vídeo até {maxSiteSizeMb} MB
                </p>

                <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750"
                  >
                    <FileArchive className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    Selecionar ZIP ou Arquivos
                  </button>

                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-750"
                  >
                    <FolderUp className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    Enviar Pasta Completa
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                  className="hidden"
                  onChange={(e) => handleFilesAdded(e.target.files)}
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <FileCode2 className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      {selectedFiles.length} arquivo(s) selecionado(s)
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {formatBytes(totalSelectedBytes)} / {maxSiteSizeMb} MB
                    </span>
                  </div>
                  <div className="max-h-28 overflow-y-auto text-xs font-mono text-slate-600 dark:text-slate-400 space-y-1">
                    {selectedFiles.slice(0, 15).map((f, idx) => (
                      <div key={idx} className="flex justify-between gap-2">
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 tabular-nums">{formatBytes(f.size)}</span>
                      </div>
                    ))}
                    {selectedFiles.length > 15 && (
                      <div className="text-slate-400">
                        + {selectedFiles.length - 15} arquivo(s) adicionais...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nota da publicação (opcional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={200}
                    placeholder="Ex: Nova página inicial e correção de estilos"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoPublish}
                    onChange={(e) => setAutoPublish(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  Publicar automaticamente no ar imediatamente após a validação
                </label>
              </div>

              {uploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
                    <span>Enviando e validando arquivos...</span>
                    <span className="font-mono tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-700 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading || selectedFiles.length === 0}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {uploading ? 'Processando...' : autoPublish ? 'Enviar e Publicar' : 'Enviar como Rascunho'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
