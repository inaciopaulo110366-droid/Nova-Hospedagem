import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Globe,
  Lock,
  Server,
  ShieldCheck,
  Sun,
  Moon,
  UploadCloud,
  X,
  AlertTriangle,
  Wand2,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { apiFetch } from '../lib/api';
import type { AnnouncementItem, DomainSuggestion, PlatformLimits } from '../types/platform';
import type { AuthModalMode } from './AuthModal';

interface LandingPageProps {
  onOpenAuth: (mode: AuthModalMode, reservedSlug?: string) => void;
}

const FAQ_ITEMS = [
  {
    q: 'A hospedagem na NovaHospeda é realmente gratuita?',
    a: 'Sim. O plano gratuito inclui até 3 sites por usuário, até 100 MB de arquivos por site, subdomínio gratuito nomedosite.nh.com.br, certificado SSL/HTTPS automático e atualizações ilimitadas dentro da cota configurada.',
  },
  {
    q: 'Quais arquivos posso enviar para publicar meu site?',
    a: 'Você pode enviar um único arquivo index.html, vários arquivos separados (HTML, CSS, JavaScript, imagens, fontes, ícones) ou um pacote .ZIP completo. Se o ZIP tiver uma pasta raiz única, a NovaHospeda detecta o index.html automaticamente.',
  },
  {
    q: 'Como funciona o endereço nomedosite.nh.com.br?',
    a: 'Ao criar um projeto, verificamos a disponibilidade e impedimos nomes duplicados ou palavras reservadas. Quando o domínio nh.com.br está apontado com DNS wildcard (*.nh.com.br) para a infraestrutura, o site responde diretamente pelo subdomínio com HTTPS, além de possuir uma URL imediata de acesso no servidor.',
  },
  {
    q: 'Posso atualizar meu site sem perder o endereço original?',
    a: 'Sim. Cada novo envio ou edição no editor integrado cria uma nova versão de publicação mantendo o mesmo subdomínio e histórico completo com opção de reversão.',
  },
  {
    q: 'Posso usar um domínio próprio no futuro?',
    a: 'Sim. Cada projeto já permite registrar o domínio personalizado desejado nas configurações para apontamento CNAME quando o roteamento de domínios externos for ativado na infraestrutura.',
  },
];

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [slugInput, setSlugInput] = useState('meusite');
  const [slugCheck, setSlugCheck] = useState<{
    checking: boolean;
    available?: boolean;
    reason?: string;
    fullDomain?: string;
  }>({ checking: false });
  const [suggestions, setSuggestions] = useState<DomainSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [limits, setLimits] = useState<PlatformLimits | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | 'report' | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Report form state
  const [repSlug, setRepSlug] = useState('');
  const [repReason, setRepReason] = useState('Phishing ou fraude');
  const [repDetails, setRepDetails] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repFeedback, setRepFeedback] = useState<string | null>(null);
  const [repError, setRepError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/info')
      .then((r) => r.json())
      .then((data) => {
        if (data?.limits) setLimits(data.limits);
        if (Array.isArray(data?.announcements)) setAnnouncements(data.announcements);
      })
      .catch(() => {});
  }, []);

  const fetchSuggestions = async (query: string) => {
    const clean = query.trim();
    if (!clean) return;
    setLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/subdomains/suggest?name=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (Array.isArray(data?.suggestions)) {
        setSuggestions(data.suggestions);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    const clean = slugInput.replace(/^-+|-+$/g, '').trim().toLowerCase();
    if (!clean) {
      setSlugCheck({ checking: false });
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      setSlugCheck((prev) => ({ ...prev, checking: true }));
      fetch(`/api/subdomains/check?slug=${encodeURIComponent(clean)}`)
        .then((r) => r.json())
        .then((res) => {
          setSlugCheck({
            checking: false,
            available: res.available,
            reason: res.reason,
            fullDomain: res.fullDomain,
          });
        })
        .catch(() => setSlugCheck({ checking: false }));
      void fetchSuggestions(clean);
    }, 280);
    return () => clearTimeout(timer);
  }, [slugInput]);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepError(null);
    setRepFeedback(null);
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          siteSlug: repSlug,
          reason: repReason,
          details: repDetails,
          reporterEmail: repEmail,
        }),
      });
      setRepFeedback('Denúncia registrada e encaminhada para análise da moderação.');
      setRepSlug('');
      setRepDetails('');
    } catch (err) {
      setRepError(err instanceof Error ? err.message : 'Erro ao enviar denúncia.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-x-hidden">
      {/* Announcements bar if active */}
      {announcements.length > 0 && (
        <div className="bg-blue-700 text-white text-xs py-2 px-4 text-center">
          <span className="font-semibold mr-2">{announcements[0].title}:</span>
          <span>{announcements[0].message}</span>
        </div>
      )}

      {/* Top Bar Contract: [Brand title, one line] — [4-5 nav links] — [1 primary action] */}
      <header className="sticky top-0 z-30 bg-slate-50/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-8">
          <a
            href="#"
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            NovaHospeda
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#como-funciona" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Como funciona
            </a>
            <a href="#beneficios" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Recursos
            </a>
            <a href="#plano-gratuito" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Plano gratuito
            </a>
            <a href="#duvidas" className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0">
              Dúvidas
            </a>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
            >
              Entrar
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="md:hidden px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0"
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-3.5 sm:px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <span className="sm:hidden">Criar Conta</span>
              <span className="hidden sm:inline">Criar Conta Grátis</span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Split */}
      <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              nh.com.br · Hospedagem estática pública · SSL automático
            </p>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1] text-balance">
              Seu site no ar, grátis e sem complicação!
            </h1>

            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Publique páginas HTML, CSS, JavaScript ou pacotes ZIP completos em segundos. Receba seu endereço gratuito em{' '}
              <span className="font-mono text-slate-900 dark:text-slate-100 font-medium">
                nomedosite.nh.com.br
              </span>{' '}
              com gerenciamento de versões e estatísticas reais de acesso.
            </p>

            {/* Subdomain Availability Live Checker & Free Domain Generator */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 max-w-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="hero-slug-check" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Digite o nome do seu site ou subdomínio gratuito
                </label>
                <button
                  type="button"
                  onClick={() => void fetchSuggestions(slugInput || 'meuapp')}
                  disabled={loadingSuggestions}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {loadingSuggestions ? 'Gerando...' : 'Gerar disponíveis'}
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="flex-1 min-w-0 flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-600">
                  <input
                    id="hero-slug-check"
                    type="text"
                    value={slugInput}
                    onChange={(e) =>
                      setSlugInput(
                        e.target.value
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '')
                          .replace(/\s+/g, '-')
                          .replace(/[^a-z0-9-]/g, '')
                          .replace(/-+/g, '-')
                          .replace(/^-+/g, '')
                      )
                    }
                    placeholder="minha loja ou meusite"
                    className="w-full min-w-0 bg-transparent font-mono text-sm text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                  <span className="font-mono text-sm text-slate-500 dark:text-slate-400 shrink-0">
                    .{limits?.primaryDomain || 'nh.com.br'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onOpenAuth(
                      'register',
                      slugCheck.available ? slugInput.replace(/^-+|-+$/g, '') : undefined
                    )
                  }
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  Criar Conta Grátis
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              {slugInput && (
                <div className="text-xs flex items-center gap-2">
                  {slugCheck.checking ? (
                    <span className="text-slate-500">Verificando disponibilidade...</span>
                  ) : slugCheck.available ? (
                    <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {slugCheck.fullDomain} está disponível para publicação imediata
                    </span>
                  ) : slugCheck.reason ? (
                    <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {slugCheck.reason}
                    </span>
                  ) : null}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Domínios gratuitos disponíveis gerados para esse nome:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.slice(0, 4).map((item) => (
                      <button
                        key={item.slug}
                        type="button"
                        onClick={() => setSlugInput(item.slug)}
                        className={`px-2.5 py-1 rounded-md border font-mono text-xs transition-colors whitespace-nowrap ${
                          slugInput.replace(/^-+|-+$/g, '') === item.slug
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-blue-500'
                        }`}
                      >
                        {item.fullDomain}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Entrar na minha conta
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Até {limits?.maxSitesPerUser ?? 3} sites grátis · {limits?.maxSiteSizeMb ?? 100} MB por site · Sem cartão
              </span>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="h-full min-h-[280px] lg:min-h-[420px] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-200 dark:bg-slate-900">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/hero_novahospeda_infra_1794832553993.jpg"
                  alt="Infraestrutura de servidores estáticos NovaHospeda"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-200">
                  <Server className="w-12 h-12 mb-3 text-blue-400" />
                  <p className="font-display font-semibold text-base">Infraestrutura NovaHospeda</p>
                  <p className="text-xs text-slate-400 mt-1 font-mono">*.nh.com.br · HTTPS</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="como-funciona" className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
              Do arquivo no seu computador para o ar em três passos
            </h2>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-2">
              Sem configurações complexas de servidor ou linha de comando.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                01. Cadastro e Subdomínio
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Crie sua conta e escolha o nome
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Cadastre-se gratuitamente e reserve endereços exclusivos como meusite.nh.com.br, loja.nh.com.br ou portfolio.nh.com.br.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                02. Upload ou Editor
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Envie HTML, ZIP ou edite online
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Arraste seu arquivo ZIP, pasta completa ou index.html. Extraímos, validamos extensões seguras e identificamos a página inicial automaticamente.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400">
                03. Publicação Contínua
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                No ar com HTTPS e histórico
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Seu site fica acessível em celulares e navegadores com acompanhamento de visitas reais e controle completo de versões.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits & Security */}
      <section id="beneficios" className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5 space-y-4">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-balance">
                Projetada para sites rápidos, isolados e seguros
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                Todos os sites publicados são servidos exclusivamente como conteúdo estático isolado, sem permissão de execução no servidor.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <Globe className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Subdomínio e DNS automático
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Verificação em tempo real contra duplicidade e nomes reservados, pronto para roteamento *.nh.com.br via Cloudflare CDN.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <Lock className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  SSL / HTTPS e cabeçalhos seguros
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Redirecionamento HTTPS configurável, proteção contra path traversal, XSS em respostas de erro e MIME types validados.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <ShieldCheck className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Proteção contra ZIP bombs
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Validação rigorosa de contagem de arquivos, tamanho descompactado e bloqueio automático de scripts PHP, Python, SH ou executáveis.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <UploadCloud className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Editor integrado e versionamento
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Edite HTML, CSS e JS no painel, visualize o rascunho antes de publicar e reverta para qualquer versão anterior sem perder o link.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Free Plan & Transparent Limits */}
      <section id="plano-gratuito" className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-8 sm:p-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                Plano Gratuito Transparente
              </span>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Recursos incluídos sem custos ocultos
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Projetado com cotas claras para manter o serviço sustentável, rápido e gratuito para estudantes, portfólios, landing pages e aplicativos web estáticos.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm shrink-0">
              <div>
                <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {limits?.maxSitesPerUser ?? 3} sites
                </div>
                <div className="text-xs text-slate-500">Por conta gratuita</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {limits?.maxSiteSizeMb ?? 100} MB
                </div>
                <div className="text-xs text-slate-500">Armazenamento por site</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
                  Ilimitadas
                </div>
                <div className="text-xs text-slate-500">Atualizações na cota</div>
              </div>
              <div>
                <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white">
                  R$ 0,00
                </div>
                <div className="text-xs text-slate-500">HTTPS e *.nh.com.br</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="duvidas" className="py-16 lg:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
            Perguntas frequentes
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-y border-slate-200 dark:border-slate-800">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={idx} className="py-4">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 text-left text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${
                      openFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaq === idx && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100">NovaHospeda</span> ·{' '}
            Seu site no ar, grátis e sem complicação! ({limits?.primaryDomain || 'nh.com.br'})
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-slate-900 dark:hover:text-slate-200">
              Termos de Uso
            </button>
            <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-slate-900 dark:hover:text-slate-200">
              Política de Privacidade
            </button>
            <button type="button" onClick={() => setLegalModal('report')} className="hover:text-slate-900 dark:hover:text-slate-200">
              Denunciar abuso
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Alternar modo claro e escuro"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Legal & Report Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {legalModal === 'terms' && 'Termos de Uso — NovaHospeda'}
                {legalModal === 'privacy' && 'Política de Privacidade'}
                {legalModal === 'report' && 'Denunciar Conteúdo Ilegal ou Abusivo'}
              </h3>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 p-5 sm:p-6 text-sm text-slate-600 dark:text-slate-300 space-y-3 overflow-y-auto leading-relaxed">
              {legalModal === 'terms' && (
                <>
                  <p>1. A NovaHospeda oferece hospedagem gratuita exclusiva para sites estáticos (HTML, CSS, JS, imagens, fontes e ativos estáticos).</p>
                  <p>2. É estritamente proibido publicar phishing, malware, páginas enganosas de captura de senhas, distribuição de conteúdo ilegal, spam ou abuso automatizado de largura de banda.</p>
                  <p>3. O plano gratuito respeita os limites vigentes de projetos por usuário e espaço em disco por site. Sites que violem estas regras podem ser suspensos ou removidos pela moderação.</p>
                </>
              )}

              {legalModal === 'privacy' && (
                <>
                  <p>1. Coletamos apenas os dados essenciais de cadastro (nome, e-mail e identificador de autenticação) e metadados dos sites hospedados para operar o serviço com segurança.</p>
                  <p>2. As estatísticas de visitas contabilizam apenas contagens agregadas de acesso às páginas HTML e cabeçalhos de referência, sem venda de dados pessoais a terceiros.</p>
                  <p>3. Você pode excluir seus sites e arquivos a qualquer momento diretamente pelo painel.</p>
                </>
              )}

              {legalModal === 'report' && (
                <form onSubmit={handleReportSubmit} className="space-y-4">
                  <p className="text-xs text-slate-500">
                    Informe o subdomínio suspeito para análise imediata da equipe de moderação.
                  </p>
                  {repFeedback && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs">
                      {repFeedback}
                    </div>
                  )}
                  {repError && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-700 dark:text-red-300 text-xs">
                      {repError}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium mb-1">Subdomínio denunciado</label>
                    <input
                      type="text"
                      required
                      value={repSlug}
                      onChange={(e) => setRepSlug(e.target.value)}
                      placeholder="Ex: site-suspeito"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Motivo</label>
                    <select
                      value={repReason}
                      onChange={(e) => setRepReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    >
                      <option>Phishing ou fraude</option>
                      <option>Malware ou arquivo malicioso</option>
                      <option>Violação de direitos autorais</option>
                      <option>Conteúdo ilegal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Detalhes</label>
                    <textarea
                      required
                      minLength={10}
                      rows={3}
                      value={repDetails}
                      onChange={(e) => setRepDetails(e.target.value)}
                      placeholder="Descreva o problema encontrado..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Seu e-mail (opcional)</label>
                    <input
                      type="email"
                      value={repEmail}
                      onChange={(e) => setRepEmail(e.target.value)}
                      placeholder="contato@exemplo.com"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                  >
                    Enviar denúncia
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
