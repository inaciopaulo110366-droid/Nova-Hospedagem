import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Globe,
  PlusCircle,
  History,
  FolderCode,
  BarChart3,
  HardDrive,
  Settings,
  HelpCircle,
  Shield,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  ExternalLink,
  UploadCloud,
  Code2,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Eye,
  Sparkles,
  Wand2,
  Download,
  FileArchive,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  apiFetch,
  buildLiveSiteUrl,
  buildPrimarySubdomainUrl,
  downloadSiteZip,
  formatBytes,
  formatDateBR,
  getAuthToken,
} from '../lib/api';
import type {
  AnnouncementItem,
  DashboardTab,
  DeploymentItem,
  DomainSuggestion,
  PlatformLimits,
  SiteItem,
} from '../types/platform';
import { AdminPanel } from './AdminPanel';
import { AnalyticsView } from './AnalyticsView';
import { PreviewModal } from './PreviewModal';
import { SiteEditor } from './SiteEditor';
import { UploadDeployModal } from './UploadDeployModal';

export function Dashboard() {
  const { profile, limits, logout, updateDisplayName, sendResetPassword, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [currentLimits, setCurrentLimits] = useState<PlatformLimits>(limits);
  const [appOrigin, setAppOrigin] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Create site state
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const quickZipInputRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [createWithStarter, setCreateWithStarter] = useState(true);
  const [createAutoPublish, setCreateAutoPublish] = useState(true);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<DomainSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [slugAvail, setSlugAvail] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
  }>({ checking: false });
  const [creating, setCreating] = useState(false);
  const [downloadingSiteId, setDownloadingSiteId] = useState<string | null>(null);

  // Modals & selected site state
  const [uploadModalSite, setUploadModalSite] = useState<SiteItem | null>(null);
  const [previewModalState, setPreviewModalState] = useState<{
    site: SiteItem;
    scope?: 'draft' | 'live';
  } | null>(null);
  const [editorSiteId, setEditorSiteId] = useState<string | null>(null);
  const [editorOpenAi, setEditorOpenAi] = useState(false);
  const [historySite, setHistorySite] = useState<SiteItem | null>(null);
  const [siteDeployments, setSiteDeployments] = useState<DeploymentItem[]>([]);
  const [editingSiteMeta, setEditingSiteMeta] = useState<SiteItem | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteSlug, setEditSiteSlug] = useState('');
  const [editCustomDomain, setEditCustomDomain] = useState('');
  const [editDomainSuggestions, setEditDomainSuggestions] = useState<DomainSuggestion[]>([]);
  const [loadingEditSuggestions, setLoadingEditSuggestions] = useState(false);
  const [confirmDeleteSiteId, setConfirmDeleteSiteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Account settings state
  const [accountName, setAccountName] = useState(profile?.displayName || '');
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (profile?.displayName) setAccountName(profile.displayName);
  }, [profile?.displayName]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadWorkspace = useCallback(async () => {
    setLoadingSites(true);
    setError(null);
    try {
      const [sitesRes, pubRes] = await Promise.all([
        apiFetch<{ sites: SiteItem[]; limits: PlatformLimits }>('/api/sites'),
        fetch('/api/public/info').then((r) => r.json()),
      ]);
      setSites(sitesRes.sites);
      setCurrentLimits(sitesRes.limits);
      if (pubRes?.appOrigin) setAppOrigin(pubRes.appOrigin);
      if (Array.isArray(pubRes?.announcements)) setAnnouncements(pubRes.announcements);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos.');
    } finally {
      setLoadingSites(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
    const pendingSlug = window.sessionStorage.getItem('nh_pending_slug');
    if (pendingSlug) {
      setNewSlug(pendingSlug);
      setNewName(pendingSlug.charAt(0).toUpperCase() + pendingSlug.slice(1));
      setActiveTab('create');
      window.sessionStorage.removeItem('nh_pending_slug');
    }
  }, [loadWorkspace]);

  const fetchCreateDomainSuggestions = useCallback(async (queryName: string) => {
    const clean = queryName.trim();
    if (clean.length < 2) {
      setDomainSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/subdomains/suggest?name=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (Array.isArray(data?.suggestions)) {
        setDomainSuggestions(data.suggestions);
        if (!slugManuallyEdited && !newSlug && data.suggestions.length > 0) {
          setNewSlug(data.suggestions[0].slug);
        }
      }
    } catch {
      // Ignore transient error
    } finally {
      setLoadingSuggestions(false);
    }
  }, [slugManuallyEdited, newSlug]);

  // Subdomain live check on Create tab
  useEffect(() => {
    if (activeTab !== 'create') return;
    const clean = newSlug.trim().toLowerCase();
    if (!clean) {
      setSlugAvail({ checking: false });
      return;
    }
    const timer = setTimeout(() => {
      setSlugAvail({ checking: true });
      fetch(`/api/subdomains/check?slug=${encodeURIComponent(clean)}`)
        .then((r) => r.json())
        .then((res) =>
          setSlugAvail({ checking: false, available: res.available, reason: res.reason })
        )
        .catch(() => setSlugAvail({ checking: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [newSlug, activeTab]);

  // Auto-generate free domain suggestions when typing site/app name
  useEffect(() => {
    if (activeTab !== 'create') return;
    if (newName.trim().length < 2) {
      setDomainSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void fetchCreateDomainSuggestions(newName);
    }, 300);
    return () => clearTimeout(timer);
  }, [newName, activeTab, fetchCreateDomainSuggestions]);

  // Load deployments when historySite changes or deployments tab opens
  const loadDeploymentsForSite = async (site: SiteItem) => {
    setHistorySite(site);
    try {
      const res = await apiFetch<{ deployments: DeploymentItem[] }>(
        `/api/sites/${site.id}/deployments`
      );
      setSiteDeployments(res.deployments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico.');
    }
  };

  useEffect(() => {
    if (activeTab === 'deployments' && sites.length > 0 && !historySite) {
      void loadDeploymentsForSite(sites[0]);
    }
  }, [activeTab, sites, historySite]);

  const handleCreateFilesSelected = useCallback(
    async (files: File[], switchToCreateTab = false) => {
      if (files.length === 0) return;
      setError(null);
      setCreateFiles(files);
      if (switchToCreateTab) {
        setActiveTab('create');
      }

      const firstName = files[0].name.replace(/\.(zip|html?|tsx?|jsx?)$/i, '');
      const cleanName = firstName
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);

      const candidateName =
        cleanName && cleanName.toLowerCase() !== 'index'
          ? cleanName.replace(/\b\w/g, (c) => c.toUpperCase())
          : 'Meu Site';

      const targetName = newName.trim() ? newName.trim() : candidateName;
      if (!newName.trim()) {
        setNewName(targetName);
      }

      if (!slugManuallyEdited || !newSlug.trim()) {
        setLoadingSuggestions(true);
        try {
          const res = await fetch(
            `/api/subdomains/suggest?name=${encodeURIComponent(targetName)}`
          );
          const data = await res.json();
          if (Array.isArray(data?.suggestions) && data.suggestions.length > 0) {
            setDomainSuggestions(data.suggestions);
            setNewSlug(data.suggestions[0].slug);
          }
        } catch {
          // Ignore transient fetch error
        } finally {
          setLoadingSuggestions(false);
        }
      }
    },
    [newName, newSlug, slugManuallyEdited]
  );

  const handleQuickPublishSite = async (site: SiteItem) => {
    setError(null);
    try {
      const res = await apiFetch<{ site: SiteItem }>(`/api/sites/${site.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Publicado pelo painel' }),
      });
      await loadWorkspace();
      setPreviewModalState({ site: res.site, scope: 'live' });
      showToast(`Site "${res.site.name}" publicado no ar!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar site.');
    }
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const maxBytes = currentLimits.maxSiteSizeMb * 1024 * 1024;
    const totalCreateBytes = createFiles.reduce((sum, f) => sum + f.size, 0);
    if (createFiles.length > 0 && totalCreateBytes > maxBytes) {
      setError(
        `Os arquivos selecionados (${formatBytes(totalCreateBytes)}) excedem o limite gratuito de ${currentLimits.maxSiteSizeMb} MB.`
      );
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch<{ site: SiteItem }>('/api/sites', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim().toLowerCase() }),
      });

      let finalSite = res.site;
      let targetScope: 'draft' | 'live' = 'draft';
      let openUploadFallback = false;

      if (createFiles.length > 0) {
        const token = await getAuthToken();
        if (!token) throw new Error('Sessão expirada. Faça login novamente.');

        const formData = new FormData();
        const relativePaths: string[] = [];
        for (const file of createFiles) {
          formData.append('files', file);
          const rel =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
          relativePaths.push(rel);
        }

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
        formData.append('publish', createAutoPublish ? 'true' : 'false');
        formData.append('notes', 'Publicação inicial na criação do site');

        const uploadResp = await fetch(`/api/sites/${res.site.id}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadResp.json().catch(() => null);
        if (!uploadResp.ok) {
          await loadWorkspace();
          setActiveTab('sites');
          throw new Error(
            uploadData?.error ||
              'O domínio foi reservado, mas o upload dos arquivos falhou. Envie novamente pelo botão Nova versão.'
          );
        }
        if (uploadData?.site) {
          finalSite = uploadData.site;
        }
        targetScope = createAutoPublish ? 'live' : 'draft';
        if (uploadData?.sourceOnlyWarning) {
          showToast(uploadData.sourceOnlyWarning);
        } else {
          showToast(
            createAutoPublish
              ? `Site "${finalSite.name}" criado, arquivos extraídos e publicados no ar!`
              : `Site "${finalSite.name}" criado com arquivos salvos em rascunho.`
          );
        }
      } else if (createWithStarter) {
        await apiFetch(`/api/sites/${res.site.id}/starter`, {
          method: 'POST',
          body: JSON.stringify({ name: res.site.name }),
        });
        if (createAutoPublish) {
          const pubRes = await apiFetch<{ site: SiteItem }>(`/api/sites/${res.site.id}/publish`, {
            method: 'POST',
            body: JSON.stringify({ notes: 'Publicação inicial automática' }),
          });
          finalSite = pubRes.site;
          targetScope = 'live';
          showToast(`Site "${finalSite.name}" criado e publicado automaticamente no ar!`);
        } else {
          targetScope = 'draft';
          showToast(`Site "${finalSite.name}" criado com modelo inicial! Use o Preview, Editor ou IA.`);
        }
      } else {
        openUploadFallback = true;
        showToast(`Site "${res.site.name}" criado! Envie seus arquivos para publicar.`);
      }

      setNewName('');
      setNewSlug('');
      setSlugManuallyEdited(false);
      setCreateFiles([]);
      if (createFileInputRef.current) createFileInputRef.current.value = '';
      setDomainSuggestions([]);
      await loadWorkspace();
      setActiveTab('sites');

      if (openUploadFallback) {
        setUploadModalSite(finalSite);
      } else {
        setPreviewModalState({ site: finalSite, scope: targetScope });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar site.');
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadSiteZip = async (site: SiteItem) => {
    setError(null);
    setDownloadingSiteId(site.id);
    try {
      await downloadSiteZip(site.id, site.slug);
      showToast(`Arquivo ${site.slug}-netlify.zip gerado com sucesso!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível exportar o ZIP.');
    } finally {
      setDownloadingSiteId(null);
    }
  };

  const handleGenerateEditSuggestions = async () => {
    if (!editingSiteMeta) return;
    setLoadingEditSuggestions(true);
    try {
      const query = editSiteName.trim() || editSiteSlug.trim() || 'site';
      const res = await fetch(
        `/api/subdomains/suggest?name=${encodeURIComponent(query)}&excludeSiteId=${encodeURIComponent(editingSiteMeta.id)}`
      );
      const data = await res.json();
      if (Array.isArray(data?.suggestions)) {
        setEditDomainSuggestions(data.suggestions);
      }
    } catch {
      // Ignore transient error
    } finally {
      setLoadingEditSuggestions(false);
    }
  };

  const handleToggleSitePause = async (site: SiteItem) => {
    if (site.status === 'blocked') return;
    const nextStatus = site.status === 'online' ? 'suspended' : 'online';
    try {
      await apiFetch(`/api/sites/${site.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadWorkspace();
      showToast(
        nextStatus === 'online'
          ? `Site ${site.slug} colocado online novamente.`
          : `Site ${site.slug} pausado temporariamente.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar status.');
    }
  };

  const handleSaveSiteMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSiteMeta) return;
    setError(null);
    try {
      await apiFetch(`/api/sites/${editingSiteMeta.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editSiteName,
          slug: editSiteSlug,
          customDomain: editCustomDomain,
        }),
      });
      setEditingSiteMeta(null);
      await loadWorkspace();
      showToast('Configurações do site atualizadas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar site.');
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    try {
      await apiFetch(`/api/sites/${siteId}`, { method: 'DELETE' });
      setConfirmDeleteSiteId(null);
      if (historySite?.id === siteId) setHistorySite(null);
      await loadWorkspace();
      showToast('Site excluído permanentemente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir site.');
    }
  };

  const handleRollback = async (siteId: string, versionId: string) => {
    try {
      await apiFetch(`/api/sites/${siteId}/rollback/${versionId}`, { method: 'POST' });
      if (historySite) await loadDeploymentsForSite(historySite);
      await loadWorkspace();
      showToast('Versão anterior restaurada no ar!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar versão.');
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    setError(null);
    try {
      await updateDisplayName(accountName);
      await refreshProfile();
      showToast('Nome da conta atualizado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar conta.');
    } finally {
      setSavingAccount(false);
    }
  };

  const copySiteUrl = async (id: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const totalStorageUsed = sites.reduce((sum, s) => sum + s.totalSizeBytes, 0);
  const totalVisits = sites.reduce((sum, s) => sum + (s.totalVisits || 0), 0);
  const publishedCount = sites.filter((s) => s.status === 'online' && s.currentVersionId).length;
  const totalQuotaBytes = currentLimits.maxSitesPerUser * currentLimits.maxSiteSizeMb * 1024 * 1024;
  const primaryDomain = currentLimits.primaryDomain || 'nh.com.br';
  const activePreviewSite = previewModalState
    ? sites.find((s) => s.id === previewModalState.site.id) || previewModalState.site
    : null;

  const navItems: Array<{ id: DashboardTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
    { id: 'sites', label: 'Meus sites', icon: Globe },
    { id: 'create', label: 'Criar novo site', icon: PlusCircle },
    { id: 'deployments', label: 'Publicações', icon: History },
    { id: 'editor', label: 'Gerenciador de arquivos', icon: FolderCode },
    { id: 'analytics', label: 'Estatísticas de visitas', icon: BarChart3 },
    { id: 'storage', label: 'Armazenamento utilizado', icon: HardDrive },
    { id: 'settings', label: 'Configurações da conta', icon: Settings },
    { id: 'help', label: 'Ajuda e suporte', icon: HelpCircle },
  ];

  if (profile?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Administração', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-x-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
          <div className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            NovaHospeda
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
            {profile?.email}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'editor') setEditorOpenAi(false);
                  setActiveTab(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar + Quick Navigation Tabs */}
        <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-base font-bold text-slate-900 dark:text-white">NovaHospeda</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Alternar tema"
                className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Abrir menu"
                className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 px-3 pb-2.5 overflow-x-auto border-t border-slate-100 dark:border-slate-800/80 pt-2">
            {(
              [
                { id: 'overview', label: 'Visão geral' },
                { id: 'sites', label: 'Meus sites' },
                { id: 'create', label: 'Novo site' },
                { id: 'editor', label: 'Editor' },
                { id: 'analytics', label: 'Estatísticas' },
                { id: 'deployments', label: 'Publicações' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'editor') setEditorOpenAi(false);
                  setActiveTab(tab.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-700 text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)}>
            <div
              className="w-72 h-full bg-white dark:bg-slate-900 p-4 flex flex-col justify-between"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1 overflow-y-auto">
                <div className="px-3 pb-3 mb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="font-bold text-base">NovaHospeda</div>
                  <div className="text-xs text-slate-500 font-mono truncate">{profile?.email}</div>
                </div>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === 'editor') setEditorOpenAi(false);
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                        activeTab === item.id
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-600"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Announcements */}
        {announcements.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/50 border-b border-blue-200 dark:border-blue-900 px-6 py-2.5 text-xs text-blue-900 dark:text-blue-200">
            <span className="font-semibold mr-2">{announcements[0].title}:</span>
            <span>{announcements[0].message}</span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6 min-w-0">
          {toast && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-between gap-2.5 p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button type="button" onClick={() => setError(null)} className="underline">
                Fechar
              </button>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Olá, {profile?.displayName}
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Gerencie seus sites estáticos, subdomínios em {primaryDomain} e publicações.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => quickZipInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold whitespace-nowrap"
                  >
                    <FileArchive className="w-4 h-4" />
                    Transformar ZIP em Site
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold whitespace-nowrap"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Criar novo site
                  </button>
                  <input
                    ref={quickZipInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = e.target.files ? Array.from(e.target.files) : [];
                      if (files.length > 0) {
                        void handleCreateFilesSelected(files, true);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Leitor de ZIP direto na Visão Geral */}
              <div className="rounded-xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-sm font-bold text-blue-950 dark:text-blue-100 flex items-center gap-2">
                    <FileArchive className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                    Leitor automático de ZIP para Site + Domínio
                  </h2>
                  <p className="text-xs text-blue-900/80 dark:text-blue-200/80 leading-relaxed">
                    Envie qualquer arquivo <span className="font-mono">.zip</span> (HTML/CSS/JS ou projeto React/Vite). O leitor extrai, compila, gera o domínio grátis <span className="font-mono">*.{primaryDomain}</span> e deixa pronto para abrir aqui e exportar para o Netlify Drop.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => quickZipInputRef.current?.click()}
                  className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
                >
                  <UploadCloud className="w-4 h-4" />
                  Selecionar arquivo .ZIP
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Sites publicados</span>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {publishedCount} / {currentLimits.maxSitesPerUser}
                  </p>
                  <span className="text-xs text-slate-400">
                    {sites.length} projeto(s) criado(s) no plano gratuito
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Espaço utilizado</span>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatBytes(totalStorageUsed)}
                  </p>
                  <span className="text-xs text-slate-400">
                    Limite: {currentLimits.maxSiteSizeMb} MB por site
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Visitas recebidas</span>
                  <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {totalVisits.toLocaleString('pt-BR')}
                  </p>
                  <span className="text-xs text-slate-400">Acessos reais contabilizados</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Seus sites recentes
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sites')}
                    className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Ver todos
                  </button>
                </div>

                {loadingSites ? (
                  <div className="p-8 text-sm text-slate-500">Carregando projetos...</div>
                ) : sites.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <Globe className="w-10 h-10 mx-auto text-slate-400" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Você ainda não publicou nenhum site
                    </p>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Crie seu primeiro projeto gratuito, escolha um subdomínio em {primaryDomain} e envie seu arquivo HTML ou ZIP.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
                    >
                      Criar primeiro site
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {sites.slice(0, 5).map((site) => (
                      <div
                        key={site.id}
                        className="px-6 py-4 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                            <span>{site.name}</span>
                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                            <span
                              className={`text-xs font-medium ${
                                site.status === 'online'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : site.status === 'suspended'
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {site.status === 'online'
                                ? 'Online'
                                : site.status === 'suspended'
                                ? 'Suspenso'
                                : 'Bloqueado'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            {site.slug}.{primaryDomain} · {formatBytes(site.totalSizeBytes)} ·{' '}
                            {(site.totalVisits ?? 0).toLocaleString('pt-BR')} visitas
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewModalState({ site, scope: 'draft' })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditorSiteId(site.id);
                              setEditorOpenAi(true);
                              setActiveTab('editor');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 whitespace-nowrap"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Corrigir com IA
                          </button>
                          <button
                            type="button"
                            onClick={() => setUploadModalSite(site)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            Enviar arquivos
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditorSiteId(site.id);
                              setEditorOpenAi(false);
                              setActiveTab('editor');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                          >
                            <Code2 className="w-3.5 h-3.5" />
                            Editor
                          </button>
                          {(site.fileCount > 0 || site.currentVersionId) && (
                            <button
                              type="button"
                              disabled={downloadingSiteId === site.id}
                              onClick={() => void handleDownloadSiteZip(site)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {downloadingSiteId === site.id ? 'Gerando...' : 'Baixar ZIP (Netlify)'}
                            </button>
                          )}
                          {site.currentVersionId && (
                            <button
                              type="button"
                              onClick={() => setPreviewModalState({ site, scope: 'live' })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
                            >
                              Abrir site <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: MEUS SITES */}
          {activeTab === 'sites' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">Meus sites</h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Gerencie publicações, arquivos, endereços e status de cada projeto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                >
                  <PlusCircle className="w-4 h-4" />
                  Novo site
                </button>
              </div>

              {sites.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Nenhum projeto criado ainda.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
                  >
                    Criar novo site
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {sites.map((site) => {
                    const liveUrl = buildLiveSiteUrl(site.slug, appOrigin);
                    const subUrl = buildPrimarySubdomainUrl(site.slug, primaryDomain);
                    return (
                      <div
                        key={site.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-4 overflow-hidden"
                      >
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <h3 className="text-base font-bold text-slate-900 dark:text-white break-words">
                                {site.name}
                              </h3>
                              <span className="text-slate-300 dark:text-slate-700">·</span>
                              <span
                                className={`text-xs font-semibold ${
                                  site.status === 'online'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : site.status === 'suspended'
                                    ? 'text-amber-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {site.status === 'online'
                                  ? 'Online'
                                  : site.status === 'suspended'
                                  ? 'Suspenso'
                                  : 'Bloqueado pela moderação'}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-xs min-w-0">
                              <span className="font-mono text-slate-700 dark:text-slate-300 truncate max-w-full">
                                {subUrl}
                              </span>
                              <span className="hidden sm:inline text-slate-400">·</span>
                              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                                {site.currentVersionId ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewModalState({ site, scope: 'live' })}
                                    className="font-mono text-blue-700 dark:text-blue-400 hover:underline truncate max-w-full sm:max-w-md text-left"
                                  >
                                    {liveUrl}
                                  </button>
                                ) : (
                                  <span className="font-mono text-slate-500 truncate max-w-full sm:max-w-md">
                                    {liveUrl}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => void copySiteUrl(site.id, liveUrl)}
                                  className="p-1 rounded text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 shrink-0"
                                  title="Copiar URL ativa"
                                >
                                  {copiedId === site.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                              <span>Criado em {formatDateBR(site.createdAt)}</span>
                              <span>Última publicação: {formatDateBR(site.lastPublishedAt)}</span>
                              <span className="font-mono tabular-nums">
                                Tamanho: {formatBytes(site.totalSizeBytes)} ({site.fileCount} arq.)
                              </span>
                              <span className="font-mono tabular-nums">
                                Visitas: {(site.totalVisits ?? 0).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {site.currentVersionId ? (
                              <button
                                type="button"
                                onClick={() => setPreviewModalState({ site, scope: 'live' })}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                Abrir site <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            ) : site.fileCount > 0 ? (
                              <button
                                type="button"
                                onClick={() => void handleQuickPublishSite(site)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                Publicar no ar agora
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setPreviewModalState({ site, scope: 'draft' })}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditorSiteId(site.id);
                                setEditorOpenAi(true);
                                setActiveTab('editor');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 whitespace-nowrap"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Corrigir com IA
                            </button>
                            <button
                              type="button"
                              onClick={() => setUploadModalSite(site)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              Nova versão (ZIP/HTML)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditorSiteId(site.id);
                                setEditorOpenAi(false);
                                setActiveTab('editor');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                              Editar arquivos
                            </button>
                            {(site.fileCount > 0 || site.currentVersionId) && (
                              <button
                                type="button"
                                disabled={downloadingSiteId === site.id}
                                onClick={() => void handleDownloadSiteZip(site)}
                                title="Baixar pacote .ZIP com index.html na raiz pronto para o Netlify Drop"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Download className="w-3.5 h-3.5" />
                                {downloadingSiteId === site.id ? 'Gerando ZIP...' : 'Baixar ZIP (Netlify)'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex flex-wrap items-center gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSiteMeta(site);
                                setEditSiteName(site.name);
                                setEditSiteSlug(site.slug);
                                setEditCustomDomain(site.customDomain || '');
                                setEditDomainSuggestions([]);
                              }}
                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Alterar nome e domínio
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                void loadDeploymentsForSite(site);
                                setActiveTab('deployments');
                              }}
                              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
                            >
                              <History className="w-3.5 h-3.5" />
                              Histórico ({site.versionCount})
                            </button>

                            {site.status !== 'blocked' && (
                              <button
                                type="button"
                                onClick={() => void handleToggleSitePause(site)}
                                className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
                              >
                                {site.status === 'online' ? (
                                  <>
                                    <PauseCircle className="w-3.5 h-3.5" /> Pausar site
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-3.5 h-3.5" /> Reativar site
                                  </>
                                )}
                              </button>
                            )}
                          </div>

                          {confirmDeleteSiteId === site.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-red-600 font-medium">Confirmar exclusão?</span>
                              <button
                                type="button"
                                onClick={() => void handleDeleteSite(site.id)}
                                className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold"
                              >
                                Sim, excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSiteId(null)}
                                className="px-2 py-1 text-slate-500"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteSiteId(site.id)}
                              className="inline-flex items-center gap-1 text-red-600 hover:underline font-medium"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir site
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: CRIAR NOVO SITE */}
          {activeTab === 'create' && (
            <div className="max-w-xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Criar site, domínio e enviar ZIP
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Selecione seu .ZIP ou HTML para gerar nome e domínio em {primaryDomain} automaticamente e publicar no ar.
                </p>
              </div>

              <form
                onSubmit={handleCreateSite}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-5"
              >
                {/* Passo 1: Leitor de ZIP / Arquivos */}
                <div className="space-y-2.5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                        1. Selecione seu arquivo .ZIP ou HTML (Leitor automático)
                      </span>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-400">
                        Suporta HTML/CSS/JS, sites em subpastas (dist/public) e projetos React/Vite (.tsx).
                      </span>
                    </div>
                    {createFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreateFiles([]);
                          if (createFileInputRef.current) createFileInputRef.current.value = '';
                        }}
                        className="text-xs font-medium text-red-600 hover:underline whitespace-nowrap"
                      >
                        Limpar arquivo
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => createFileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                    >
                      <FileArchive className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                      {createFiles.length > 0 ? 'Trocar arquivo .ZIP / HTML' : 'Selecionar ZIP ou HTML/arquivos'}
                    </button>
                    <input
                      ref={createFileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        if (files.length > 0) {
                          void handleCreateFilesSelected(files, false);
                        }
                      }}
                    />
                    {createFiles.length > 0 ? (
                      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                        {createFiles.length === 1
                          ? createFiles[0].name
                          : `${createFiles.length} arquivo(s) selecionado(s)`}{' '}
                        ({formatBytes(createFiles.reduce((s, f) => s + f.size, 0))})
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Opcional: ou comece com o modelo pronto abaixo.
                      </span>
                    )}
                  </div>
                </div>

                {/* Passo 2: Nome e Domínio */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    2. Nome do site ou app
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={newName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewName(val);
                      if (!slugManuallyEdited) {
                        setNewSlug(
                          val
                            .toLowerCase()
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9-]/g, '-')
                            .replace(/-+/g, '-')
                            .replace(/^-|-$/g, '')
                        );
                      }
                    }}
                    placeholder="Ex: Loja Tech Brasil"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      3. Subdomínio grátis desejado
                    </label>
                    <button
                      type="button"
                      onClick={() => void fetchCreateDomainSuggestions(newName || newSlug || 'site')}
                      disabled={loadingSuggestions}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {loadingSuggestions ? 'Gerando...' : 'Gerar domínio disponível'}
                    </button>
                  </div>

                  <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue-600">
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={48}
                      value={newSlug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      placeholder="lojatech"
                      className="w-full bg-transparent font-mono text-sm focus:outline-none min-w-0"
                    />
                    <span className="font-mono text-sm text-slate-500 shrink-0">
                      .{primaryDomain}
                    </span>
                  </div>

                  {newSlug && (
                    <div className="text-xs">
                      {slugAvail.checking ? (
                        <span className="text-slate-500">Verificando disponibilidade...</span>
                      ) : slugAvail.available ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                          {newSlug}.{primaryDomain} disponível!
                        </span>
                      ) : slugAvail.reason ? (
                        <span className="text-red-600 dark:text-red-400">{slugAvail.reason}</span>
                      ) : null}
                    </div>
                  )}

                  {domainSuggestions.length > 0 && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-2">
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Sugestões disponíveis grátis:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {domainSuggestions.map((s) => (
                          <button
                            key={s.slug}
                            type="button"
                            onClick={() => {
                              setSlugManuallyEdited(true);
                              setNewSlug(s.slug);
                            }}
                            className={`px-2.5 py-1 rounded-md border font-mono text-xs transition-colors whitespace-nowrap ${
                              newSlug === s.slug
                                ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                            }`}
                          >
                            {s.fullDomain}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {createFiles.length === 0 && (
                  <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createWithStarter}
                      onChange={(e) => setCreateWithStarter(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300"
                    />
                    <div className="text-xs space-y-0.5">
                      <span className="block font-semibold text-slate-800 dark:text-slate-200">
                        Iniciar com modelo HTML + CSS + JS pronto para Preview e IA
                      </span>
                      <span className="block text-slate-500 dark:text-slate-400">
                        Se preferir enviar arquivos manualmente depois, basta desmarcar esta opção.
                      </span>
                    </div>
                  </label>
                )}

                {(createFiles.length > 0 || createWithStarter) && (
                  <label className="flex items-start gap-2.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 p-3.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createAutoPublish}
                      onChange={(e) => setCreateAutoPublish(e.target.checked)}
                      className="mt-0.5 rounded border-blue-400 text-blue-700"
                    />
                    <div className="text-xs space-y-0.5">
                      <span className="block font-semibold text-blue-950 dark:text-blue-200">
                        Publicar automaticamente no ar logo após criar
                      </span>
                      <span className="block text-blue-800/80 dark:text-blue-300/80">
                        Seu site já fica online e pronto para abrir no Preview e exportar o ZIP para o Netlify.
                      </span>
                    </div>
                  </label>
                )}

                <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    Limites do plano gratuito ({sites.length} de {currentLimits.maxSitesPerUser} sites usados)
                  </p>
                  <p>
                    Cada site suporta até {currentLimits.maxSiteSizeMb} MB de arquivos estáticos com SSL e atualizações ilimitadas.
                  </p>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating || slugAvail.available === false}
                  className="w-full py-3 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {creating
                    ? 'Processando ZIP e publicando...'
                    : createFiles.length > 0
                    ? createAutoPublish
                      ? 'Transformar ZIP em Site e Publicar Agora'
                      : 'Criar domínio e salvar arquivos (rascunho)'
                    : createWithStarter
                    ? createAutoPublish
                      ? 'Criar site e publicar no ar'
                      : 'Criar site e abrir Preview'
                    : 'Criar site e enviar arquivos'}
                </button>
              </form>
            </div>
          )}

          {/* TAB: PUBLICAÇÕES */}
          {activeTab === 'deployments' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                    Histórico de publicações
                  </h1>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Acompanhe cada versão enviada e restaure versões anteriores com um clique.
                  </p>
                </div>

                {sites.length > 0 && (
                  <select
                    value={historySite?.id || sites[0].id}
                    onChange={(e) => {
                      const found = sites.find((s) => s.id === e.target.value);
                      if (found) void loadDeploymentsForSite(found);
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.slug}.{primaryDomain})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {sites.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
                  Crie um site para visualizar suas publicações.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
                  {siteDeployments.length === 0 ? (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-sm text-slate-500">
                        Nenhuma versão publicada ainda para {historySite?.name}.
                      </p>
                      {historySite && (
                        <button
                          type="button"
                          onClick={() => setUploadModalSite(historySite)}
                          className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
                        >
                          Enviar primeira versão
                        </button>
                      )}
                    </div>
                  ) : (
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
                        <tr>
                          <th className="px-5 py-3 font-medium">Versão</th>
                          <th className="px-5 py-3 font-medium">Origem</th>
                          <th className="px-5 py-3 font-medium">Observação</th>
                          <th className="px-5 py-3 font-medium text-right">Arquivos</th>
                          <th className="px-5 py-3 font-medium text-right">Tamanho</th>
                          <th className="px-5 py-3 font-medium">Data</th>
                          <th className="px-5 py-3 font-medium text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {siteDeployments.map((dep) => (
                          <tr key={dep.id}>
                            <td className="px-5 py-3.5 font-mono font-semibold text-xs">
                              v{dep.versionNumber}{' '}
                              {dep.status === 'published' && (
                                <span className="ml-1.5 text-emerald-700 dark:text-emerald-400">
                                  (No ar)
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-xs uppercase font-mono text-slate-500">
                              {dep.sourceType}
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                              {dep.notes}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                              {dep.fileCount}
                            </td>
                            <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                              {formatBytes(dep.sizeBytes)}
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-500">
                              {formatDateBR(dep.createdAt)}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {dep.status !== 'published' && historySite && (
                                <button
                                  type="button"
                                  onClick={() => void handleRollback(historySite.id, dep.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Restaurar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: GERENCIADOR E EDITOR */}
          {activeTab === 'editor' && (
            <SiteEditor
              sites={sites}
              selectedSiteId={editorSiteId}
              openAiInitially={editorOpenAi}
              appOrigin={appOrigin}
              onSelectSite={(id) => setEditorSiteId(id)}
              onPublished={() => void loadWorkspace()}
            />
          )}

          {/* TAB: ESTATÍSTICAS */}
          {activeTab === 'analytics' && (
            <AnalyticsView
              sites={sites}
              appOrigin={appOrigin}
              onOpenSite={(siteId) => {
                const found = sites.find((s) => s.id === siteId);
                if (found) setPreviewModalState({ site: found, scope: 'live' });
              }}
            />
          )}

          {/* TAB: ARMAZENAMENTO */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Armazenamento utilizado
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Consumo real em disco por projeto dentro dos limites gratuitos da plataforma.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Uso combinado da conta</span>
                  <span className="font-mono tabular-nums">
                    {formatBytes(totalStorageUsed)} / {formatBytes(totalQuotaBytes)}
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-700"
                    style={{
                      width: `${Math.min(100, (totalStorageUsed / Math.max(1, totalQuotaBytes)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Cada projeto possui limite individual de {currentLimits.maxSiteSizeMb} MB, com até{' '}
                  {currentLimits.maxSitesPerUser} sites simultâneos gratuitos.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {sites.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Nenhum arquivo armazenado.
                  </div>
                ) : (
                  sites.map((s) => {
                    const siteLimit = currentLimits.maxSiteSizeMb * 1024 * 1024;
                    const pct = Math.min(100, Math.round((s.totalSizeBytes / siteLimit) * 100));
                    return (
                      <div key={s.id} className="p-5 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-semibold">{s.name}</span>
                            <span className="ml-2 font-mono text-xs text-slate-500">
                              {s.slug}.{primaryDomain}
                            </span>
                          </div>
                          <span className="font-mono text-xs tabular-nums">
                            {formatBytes(s.totalSizeBytes)} / {currentLimits.maxSiteSizeMb} MB ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB: CONFIGURAÇÕES DA CONTA */}
          {activeTab === 'settings' && (
            <div className="max-w-xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Configurações da conta
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Atualize seus dados cadastrais e segurança de acesso.
                </p>
              </div>

              <form
                onSubmit={handleUpdateAccount}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nome de exibição
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    E-mail verificado
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile?.email || ''}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-sm font-mono text-slate-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingAccount}
                    className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                  >
                    {savingAccount ? 'Salvando...' : 'Salvar alterações'}
                  </button>

                  {profile?.email && (
                    <button
                      type="button"
                      onClick={() =>
                        void sendResetPassword(profile.email)
                          .then(() => showToast('Enviamos um e-mail para redefinir sua senha.'))
                          .catch((err) =>
                            setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.')
                          )
                      }
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Enviar e-mail de redefinição de senha
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB: AJUDA E SUPORTE */}
          {activeTab === 'help' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  Ajuda, Domínio e Documentação
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Guia técnico de publicação, pacotes ZIP e configuração do domínio {primaryDomain}.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  1. Como preparar seus arquivos para publicação
                </h2>
                <p>
                  Seu projeto deve conter um arquivo principal <span className="font-mono">index.html</span>. Caso envie um arquivo <span className="font-mono">.zip</span> onde todos os arquivos estejam dentro de uma única pasta (ex: <span className="font-mono">meu-site/index.html</span>), o sistema remove a pasta raiz automaticamente e coloca o site no ar.
                </p>
                <p>
                  Por segurança, arquivos executáveis no servidor (como <span className="font-mono">.php</span>, <span className="font-mono">.py</span>, <span className="font-mono">.sh</span>, <span className="font-mono">.exe</span>) são bloqueados automaticamente. Apenas conteúdo estático (HTML, CSS, JS, imagens, fontes, vídeos e JSON) é aceito.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  2. Configuração DNS e HTTPS para *.{primaryDomain}
                </h2>
                <p>
                  O servidor da NovaHospeda já processa cabeçalhos <span className="font-mono">Host: nomedosite.{primaryDomain}</span> nativamente. Para que qualquer subdomínio criado pelos usuários responda publicamente nesse domínio próprio com SSL e CDN:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs">
                  <li>Aponte os registros DNS na Cloudflare para <span className="font-mono">{primaryDomain}</span> e wildcard <span className="font-mono">*.{primaryDomain}</span> (CNAME ou A para o servidor de produção, com Proxy Cloudflare ativado).</li>
                  <li>Ative SSL/TLS no modo <strong>Full (Strict)</strong> e <strong>Always Use HTTPS</strong> na Cloudflare.</li>
                  <li>Opcionalmente defina <span className="font-mono">FORCE_HTTPS=true</span> e credenciais de armazenamento objeto compatível S3/Cloudflare R2 nas variáveis de ambiente.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  3. Exportar ZIP e publicar sites grátis no Netlify Drop
                </h2>
                <p>
                  Se quiser publicar qualquer site criado ou editado aqui diretamente no Netlify sem precisar configurar faturamento na nuvem:
                </p>
                <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                  <li>
                    Em <strong>Meus sites</strong> ou dentro do <strong>Preview</strong>, clique em <strong>Baixar ZIP (Netlify)</strong> para gerar o pacote <span className="font-mono">nomedosite-netlify.zip</span> já estruturado com <span className="font-mono">index.html</span> na raiz.
                  </li>
                  <li>
                    Crie ou entre em sua conta gratuita do Netlify e abra o <strong>Netlify Drop</strong> (<span className="font-mono">app.netlify.com/drop</span>).
                  </li>
                  <li>
                    Arraste ou selecione o arquivo <span className="font-mono">.zip</span> baixado — seu site estático entra no ar instantaneamente com HTTPS gratuito no domínio <span className="font-mono">.netlify.app</span>.
                  </li>
                </ol>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Observação: o Netlify hospeda gratuitamente os sites estáticos exportados em ZIP. Já o painel completo da NovaHospeda utiliza servidor Node.js/Express para autenticação, extração de ZIP e IA.
                </p>
              </div>
            </div>
          )}

          {/* TAB: ADMIN */}
          {activeTab === 'admin' && profile?.role === 'admin' && (
            <AdminPanel appOrigin={appOrigin} onLimitsUpdated={() => void loadWorkspace()} />
          )}
        </main>
      </div>

      {/* Upload / Deploy Modal */}
      {uploadModalSite && (
        <UploadDeployModal
          site={uploadModalSite}
          maxSiteSizeMb={currentLimits.maxSiteSizeMb}
          primaryDomain={primaryDomain}
          appOrigin={appOrigin}
          onClose={() => setUploadModalSite(null)}
          onSuccess={() => {
            void loadWorkspace();
          }}
          onOpenLiveSite={(targetSite) => {
            setUploadModalSite(null);
            setPreviewModalState({ site: targetSite, scope: 'live' });
          }}
        />
      )}

      {/* Live Preview Modal */}
      {activePreviewSite && (
        <PreviewModal
          site={activePreviewSite}
          primaryDomain={primaryDomain}
          appOrigin={appOrigin}
          initialScope={previewModalState?.scope}
          onClose={() => setPreviewModalState(null)}
          onOpenEditor={(siteId, openAi) => {
            setPreviewModalState(null);
            setEditorSiteId(siteId);
            setEditorOpenAi(Boolean(openAi));
            setActiveTab('editor');
          }}
          onOpenUpload={(targetSite) => {
            setPreviewModalState(null);
            setUploadModalSite(targetSite);
          }}
          onPublished={() => {
            void loadWorkspace();
          }}
        />
      )}

      {/* Rename / Domain Edit Modal */}
      {editingSiteMeta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold">Editar projeto e domínio</h3>
              <button
                type="button"
                onClick={() => setEditingSiteMeta(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveSiteMeta} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Nome do site</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={editSiteName}
                  onChange={(e) => setEditSiteName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium">Subdomínio ({primaryDomain})</label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateEditSuggestions()}
                    disabled={loadingEditSuggestions}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {loadingEditSuggestions ? 'Gerando...' : 'Gerar disponíveis'}
                  </button>
                </div>
                <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                  <input
                    type="text"
                    required
                    value={editSiteSlug}
                    onChange={(e) =>
                      setEditSiteSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }
                    className="w-full bg-transparent font-mono text-sm focus:outline-none"
                  />
                  <span className="font-mono text-xs text-slate-500">.{primaryDomain}</span>
                </div>
                {editDomainSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {editDomainSuggestions.slice(0, 4).map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onClick={() => setEditSiteSlug(s.slug)}
                        className={`px-2 py-1 rounded border font-mono text-xs whitespace-nowrap ${
                          editSiteSlug === s.slug
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {s.fullDomain}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Domínio próprio futuro (CNAME opcional)
                </label>
                <input
                  type="text"
                  value={editCustomDomain}
                  onChange={(e) => setEditCustomDomain(e.target.value)}
                  placeholder="Ex: www.minhaempresa.com.br"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSiteMeta(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                >
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
