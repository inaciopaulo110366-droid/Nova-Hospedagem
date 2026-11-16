import React, { useCallback, useEffect, useState } from 'react';
import {
  FileCode2,
  Plus,
  Trash2,
  Save,
  Eye,
  Rocket,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  Wrench,
} from 'lucide-react';
import { apiFetch, buildLiveSiteUrl, formatBytes } from '../lib/api';
import type { AiFixResponse, SiteFile, SiteItem } from '../types/platform';

interface SiteEditorProps {
  sites: SiteItem[];
  selectedSiteId: string | null;
  openAiInitially?: boolean;
  appOrigin: string;
  onSelectSite: (siteId: string) => void;
  onPublished: () => void;
}

const DEFAULT_STARTER_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Meu Site na NovaHospeda</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Olá, mundo!</h1>
    <p>Site hospedado gratuitamente na NovaHospeda.</p>
  </main>
  <script src="app.js"></script>
</body>
</html>
`;

export function SiteEditor({
  sites,
  selectedSiteId,
  openAiInitially = false,
  appOrigin,
  onSelectSite,
  onPublished,
}: SiteEditorProps) {
  const activeSite = sites.find((s) => s.id === selectedSiteId) || sites[0] || null;
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview' | 'ai'>(
    openAiInitially ? 'ai' : 'code'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewEmpty, setPreviewEmpty] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'mobile' : 'desktop'
  );
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // AI Fixer state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiResult, setAiResult] = useState<AiFixResponse | null>(null);
  const [selectedPatches, setSelectedPatches] = useState<Record<string, boolean>>({});
  const [expandedPatch, setExpandedPatch] = useState<string | null>(null);

  const isDirty = editorContent !== originalContent;

  useEffect(() => {
    setViewMode(openAiInitially ? 'ai' : 'code');
  }, [openAiInitially, selectedSiteId]);

  const loadFiles = useCallback(async (siteId: string) => {
    setLoadingFiles(true);
    setFeedback(null);
    try {
      const data = await apiFetch<{ files: SiteFile[] }>(`/api/sites/${siteId}/files?scope=draft`);
      setFiles(data.files);
      if (data.files.length > 0) {
        const preferred =
          data.files.find((f) => f.path.toLowerCase() === 'index.html') ||
          data.files.find((f) => f.isText) ||
          data.files[0];
        setActiveFilePath(preferred.path);
      } else {
        setActiveFilePath(null);
        setEditorContent('');
        setOriginalContent('');
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao listar arquivos.' });
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (activeSite) {
      void loadFiles(activeSite.id);
      setPreviewUrl(null);
      setAiResult(null);
    }
  }, [activeSite?.id, loadFiles]);

  useEffect(() => {
    if (!activeSite || !activeFilePath) return;
    const fileMeta = files.find((f) => f.path === activeFilePath);
    if (fileMeta && !fileMeta.isText) {
      setEditorContent('');
      setOriginalContent('');
      return;
    }

    let cancelled = false;
    setLoadingFile(true);
    apiFetch<{ content: string }>(
      `/api/sites/${activeSite.id}/file?scope=draft&path=${encodeURIComponent(activeFilePath)}`
    )
      .then((res) => {
        if (!cancelled) {
          setEditorContent(res.content);
          setOriginalContent(res.content);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao abrir arquivo.' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSite?.id, activeFilePath, files]);

  const handleSave = async () => {
    if (!activeSite || !activeFilePath) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ files: SiteFile[] }>(`/api/sites/${activeSite.id}/file`, {
        method: 'PUT',
        body: JSON.stringify({ path: activeFilePath, content: editorContent }),
      });
      setFiles(res.files);
      setOriginalContent(editorContent);
      setFeedback({ type: 'ok', text: `Arquivo "${activeFilePath}" salvo no rascunho sem alterar seu código.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao salvar arquivo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStarter = async (openPreviewAfter = false) => {
    if (!activeSite) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ files: SiteFile[] }>(`/api/sites/${activeSite.id}/starter`, {
        method: 'POST',
      });
      setFiles(res.files);
      setActiveFilePath('index.html');
      setPreviewEmpty(false);
      setFeedback({ type: 'ok', text: 'Modelo inicial HTML + CSS + JS gerado no rascunho!' });
      if (openPreviewAfter) {
        const tok = await apiFetch<{
          token: string;
          previewPath?: string;
        }>(`/api/sites/${activeSite.id}/preview-token`);
        const basePath = tok.previewPath || `/p/${encodeURIComponent(tok.token)}/${activeSite.id}/draft/`;
        setPreviewUrl(`${basePath}?t=${Date.now()}`);
        setViewMode('preview');
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao gerar modelo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSite) return;
    const clean = newFileName.trim().replace(/^\/+/, '');
    if (!clean) return;
    setSaving(true);
    setFeedback(null);
    try {
      const starter =
        clean.endsWith('.html') || clean.endsWith('.htm')
          ? DEFAULT_STARTER_HTML
          : clean.endsWith('.css')
          ? '/* Estilos do site */\nbody {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n}\n'
          : clean.endsWith('.js')
          ? '// Script do site\nconsole.log("Site carregado");\n'
          : '';
      const res = await apiFetch<{ files: SiteFile[] }>(`/api/sites/${activeSite.id}/file`, {
        method: 'PUT',
        body: JSON.stringify({ path: clean, content: starter }),
      });
      setFiles(res.files);
      setActiveFilePath(clean);
      setEditorContent(starter);
      setOriginalContent(starter);
      setNewFileName('');
      setShowNewFileInput(false);
      setViewMode('code');
      setFeedback({ type: 'ok', text: `Arquivo "${clean}" criado.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao criar arquivo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!activeSite) return;
    setFeedback(null);
    try {
      const res = await apiFetch<{ files: SiteFile[] }>(
        `/api/sites/${activeSite.id}/file?path=${encodeURIComponent(filePath)}`,
        { method: 'DELETE' }
      );
      setFiles(res.files);
      if (activeFilePath === filePath) {
        const next = res.files.find((f) => f.isText) || res.files[0] || null;
        setActiveFilePath(next ? next.path : null);
      }
      setFeedback({ type: 'ok', text: `Arquivo "${filePath}" excluído do rascunho.` });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao excluir arquivo.' });
    }
  };

  const handlePreview = async () => {
    if (!activeSite) return;
    if (isDirty && activeFilePath) {
      await handleSave();
    }
    try {
      const res = await apiFetch<{
        token: string;
        previewPath?: string;
        hasDraftFiles?: boolean;
        hasLiveFiles?: boolean;
      }>(`/api/sites/${activeSite.id}/preview-token`);
      if (res.hasDraftFiles === false && res.hasLiveFiles === false) {
        setPreviewUrl(null);
        setPreviewEmpty(true);
        setViewMode('preview');
        return;
      }
      setPreviewEmpty(false);
      const basePath =
        res.previewPath || `/p/${encodeURIComponent(res.token)}/${activeSite.id}/draft/`;
      setPreviewUrl(`${basePath}?t=${Date.now()}`);
      setViewMode('preview');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao gerar pré-visualização.' });
    }
  };

  const handleRunAiFix = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeSite) return;
    if (isDirty && activeFilePath) {
      await handleSave();
    }
    setAiLoading(true);
    setFeedback(null);
    setAiResult(null);
    try {
      const res = await apiFetch<AiFixResponse>(`/api/sites/${activeSite.id}/ai-fix`, {
        method: 'POST',
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      setAiResult(res);
      const sel: Record<string, boolean> = {};
      for (const p of res.patches) {
        sel[p.path] = true;
      }
      setSelectedPatches(sel);
      if (res.patches.length > 0) {
        setExpandedPatch(res.patches[0].path);
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao analisar com IA.' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiPatches = async () => {
    if (!activeSite || !aiResult) return;
    const chosen = aiResult.patches.filter((p) => selectedPatches[p.path]);
    if (chosen.length === 0) {
      setFeedback({ type: 'err', text: 'Selecione pelo menos um arquivo corrigido para aplicar.' });
      return;
    }
    setAiApplying(true);
    setFeedback(null);
    try {
      const res = await apiFetch<{ appliedPaths: string[]; files: SiteFile[] }>(
        `/api/sites/${activeSite.id}/ai-apply`,
        {
          method: 'POST',
          body: JSON.stringify({ patches: chosen }),
        }
      );
      setFiles(res.files);
      if (activeFilePath && res.appliedPaths.includes(activeFilePath)) {
        const refreshed = await apiFetch<{ content: string }>(
          `/api/sites/${activeSite.id}/file?scope=draft&path=${encodeURIComponent(activeFilePath)}`
        );
        setEditorContent(refreshed.content);
        setOriginalContent(refreshed.content);
      }
      setFeedback({
        type: 'ok',
        text: `Correções aplicadas no rascunho (${res.appliedPaths.join(', ')}). Confira no Preview e clique em "Publicar versão" quando estiver pronto.`,
      });
      await handlePreview();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao aplicar correções.' });
    } finally {
      setAiApplying(false);
    }
  };

  const handlePublish = async () => {
    if (!activeSite) return;
    if (isDirty && activeFilePath) {
      await handleSave();
    }
    setPublishing(true);
    setFeedback(null);
    try {
      await apiFetch(`/api/sites/${activeSite.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Publicado via Editor NovaHospeda' }),
      });
      setFeedback({
        type: 'ok',
        text: `Publicação atualizada no ar! Endereço ativo: ${buildLiveSiteUrl(activeSite.slug, appOrigin)}`,
      });
      onPublished();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Erro ao publicar.' });
    } finally {
      setPublishing(false);
    }
  };

  if (sites.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
        <FileCode2 className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Nenhum site criado ainda
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Crie seu primeiro projeto em "Criar novo site" para editar HTML, CSS e JavaScript aqui.
        </p>
      </div>
    );
  }

  const activeMeta = files.find((f) => f.path === activeFilePath);
  const frameClass =
    previewViewport === 'desktop'
      ? 'w-full h-[65dvh] min-h-[340px] lg:h-[520px]'
      : previewViewport === 'tablet'
      ? 'w-[768px] max-w-none shrink-0 h-[65dvh] min-h-[360px] lg:h-[520px]'
      : 'w-full max-w-[390px] h-[65dvh] min-h-[380px] lg:h-[520px]';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Projeto:</label>
          <select
            value={activeSite?.id || ''}
            onChange={(e) => onSelectSite(e.target.value)}
            className="w-full sm:w-auto min-w-0 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug}.nh.com.br)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'code'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Código
            </button>
            <button
              type="button"
              onClick={() => void handlePreview()}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'preview'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview ao vivo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ai')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                viewMode === 'ai'
                  ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Corrigir com IA
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !isDirty || !activeFilePath}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : isDirty ? 'Salvar alterações' : 'Salvo'}
          </button>

          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing || files.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            <Rocket className="w-3.5 h-3.5" />
            {publishing ? 'Publicando...' : 'Publicar versão'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Split Explorer + Editor/Preview/AI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden min-h-[420px] lg:min-h-[560px]">
        {/* File Tree: hidden on mobile during Preview/AI so iframe/AI get full screen */}
        <aside
          className={`lg:col-span-3 min-w-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex-col ${
            viewMode === 'code' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Arquivos ({files.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => activeSite && void loadFiles(activeSite.id)}
                title="Recarregar arquivos"
                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setShowNewFileInput((v) => !v)}
                title="Criar novo arquivo"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/60"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo
              </button>
            </div>
          </div>

          {showNewFileInput && (
            <form onSubmit={handleCreateFile} className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50 dark:bg-slate-950">
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="Ex: index.html ou css/style.css"
                className="w-full px-2.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowNewFileInput(false)}
                  className="px-2 py-1 text-xs text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-md bg-blue-700 text-white text-xs font-semibold"
                >
                  Criar
                </button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 max-h-[170px] lg:max-h-[500px]">
            {files.length === 0 ? (
              <div className="p-4 text-center space-y-2.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pasta vazia. Crie um arquivo ou gere um modelo inicial pronto para preview e edição.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateStarter(false)}
                    disabled={saving}
                    className="px-3 py-2 rounded-md bg-blue-700 text-white text-xs font-semibold"
                  >
                    Gerar modelo inicial (HTML+CSS+JS)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFileName('index.html');
                      setShowNewFileInput(true);
                    }}
                    className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-xs font-medium"
                  >
                    Criar index.html em branco
                  </button>
                </div>
              </div>
            ) : (
              files.map((f) => (
                <div
                  key={f.path}
                  className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    activeFilePath === f.path
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-medium'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => {
                    setActiveFilePath(f.path);
                    setViewMode('code');
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="font-mono truncate">{f.path}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {formatBytes(f.sizeBytes)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteFile(f.path);
                      }}
                      title={`Excluir ${f.path}`}
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-600 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Code / Live Preview / AI Fixer Pane */}
        <div className="lg:col-span-9 min-w-0 flex flex-col bg-slate-50 dark:bg-slate-950">
          {viewMode === 'ai' ? (
            <div className="flex-1 p-5 sm:p-6 space-y-5 overflow-y-auto">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    Assistente de IA para Correção de Erros
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Analisa todos os arquivos HTML, CSS e JS do rascunho de "{activeSite?.name}", diagnostica erros e sugere correções prontas para aplicar.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunAiFix} className="space-y-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Descreva o erro que deseja corrigir (opcional — deixe em branco para auditoria completa)
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Ex: O menu não abre no celular, erro no JavaScript ao clicar no botão, ou CSS desalinhado..."
                    className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={aiLoading || files.length === 0}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
                    {aiLoading ? 'Analisando projeto...' : 'Analisar e corrigir'}
                  </button>
                </div>
              </form>

              {aiResult && (
                <div className="space-y-5 pt-2">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Resumo da análise
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      {aiResult.summary}
                    </p>
                  </div>

                  {aiResult.diagnostics.length > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Diagnósticos encontrados ({aiResult.diagnostics.length})
                      </h4>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {aiResult.diagnostics.map((d, idx) => (
                          <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-semibold ${
                                    d.severity === 'error'
                                      ? 'text-red-600 dark:text-red-400'
                                      : d.severity === 'warning'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-blue-700 dark:text-blue-400'
                                  }`}
                                >
                                  {d.severity === 'error'
                                    ? 'Erro'
                                    : d.severity === 'warning'
                                    ? 'Alerta'
                                    : 'Melhoria'}
                                </span>
                                <span className="font-mono text-slate-500">{d.file}</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300">{d.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiResult.patches.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Correções propostas ({aiResult.patches.length} arquivo(s))
                        </h4>
                        <button
                          type="button"
                          disabled={aiApplying}
                          onClick={() => void handleApplyAiPatches()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {aiApplying ? 'Aplicando...' : 'Aplicar correções no rascunho e abrir Preview'}
                        </button>
                      </div>

                      <div className="space-y-3">
                        {aiResult.patches.map((patch) => (
                          <div
                            key={patch.path}
                            className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden"
                          >
                            <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-3 text-xs">
                              <label className="flex items-center gap-2 font-mono font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(selectedPatches[patch.path])}
                                  onChange={(e) =>
                                    setSelectedPatches((prev) => ({
                                      ...prev,
                                      [patch.path]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-slate-300 text-blue-700"
                                />
                                {patch.path}
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPatch((cur) => (cur === patch.path ? null : patch.path))
                                }
                                className="text-blue-700 dark:text-blue-400 hover:underline font-medium"
                              >
                                {expandedPatch === patch.path ? 'Ocultar código' : 'Ver código corrigido'}
                              </button>
                            </div>
                            <div className="px-3.5 py-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                              {patch.reason}
                            </div>
                            {expandedPatch === patch.path && (
                              <pre className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto max-h-64 border-t border-slate-800">
                                {patch.fixedContent}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-xs text-emerald-800 dark:text-emerald-300">
                      Nenhum erro crítico que exija alteração de arquivo foi detectado pela análise.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : viewMode === 'preview' ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
                <span className="font-mono">Preview do rascunho</span>

                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    title="Celular"
                    className={`p-1.5 rounded ${
                      previewViewport === 'mobile'
                        ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('tablet')}
                    title="Tablet"
                    className={`p-1.5 rounded ${
                      previewViewport === 'tablet'
                        ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    title="Desktop"
                    className={`p-1.5 rounded ${
                      previewViewport === 'desktop'
                        ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400'
                        : 'text-slate-500'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                </div>

                {previewUrl && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handlePreview()}
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-medium hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" /> Atualizar
                    </button>
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium hover:underline"
                    >
                      Nova aba <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
              <div className="flex-1 p-2 sm:p-4 bg-slate-100 dark:bg-slate-950 flex flex-col items-center overflow-auto">
                {previewEmpty ? (
                  <div className="m-auto max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Nenhum arquivo no rascunho ainda
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gere um modelo inicial HTML + CSS + JS para abrir o Preview imediatamente.
                    </p>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleCreateStarter(true)}
                      className="px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {saving ? 'Gerando...' : 'Gerar modelo inicial e visualizar'}
                    </button>
                  </div>
                ) : previewUrl ? (
                  <div
                    className={`bg-white border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-xs flex flex-col transition-all duration-200 ${frameClass}`}
                  >
                    <iframe
                      key={previewUrl}
                      title="Pré-visualização do site"
                      src={previewUrl}
                      className="w-full h-full flex-1 border-0 bg-white"
                    />
                  </div>
                ) : (
                  <div className="m-auto text-xs text-slate-500">Carregando pré-visualização...</div>
                )}
              </div>
            </div>
          ) : activeFilePath ? (
            activeMeta && !activeMeta.isText ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {activeFilePath}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Arquivo binário/mídia ({activeMeta.mimeType} · {formatBytes(activeMeta.sizeBytes)}). Edição de texto indisponível para este formato.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {activeFilePath}
                    {isDirty ? ' · modificado' : ''}
                  </span>
                  <span className="text-slate-400">Código preservado integralmente ao salvar</span>
                </div>
                <textarea
                  value={loadingFile ? 'Carregando arquivo...' : editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  disabled={loadingFile}
                  spellCheck={false}
                  className="flex-1 w-full min-h-[300px] sm:min-h-[480px] p-4 font-mono text-xs leading-relaxed bg-slate-950 text-slate-100 focus:outline-none resize-none"
                />
              </div>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
              Selecione, crie um arquivo ou gere o modelo inicial para editar.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
