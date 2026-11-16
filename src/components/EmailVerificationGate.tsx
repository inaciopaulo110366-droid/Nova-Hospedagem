import React, { useState } from 'react';
import { MailCheck, RefreshCw, LogOut, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function EmailVerificationGate() {
  const { firebaseUser, resendVerification, refreshVerification, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await resendVerification();
      setMessage('E-mail de confirmação reenviado! Verifique sua caixa de entrada e spam.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reenviar e-mail.');
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const verified = await refreshVerification();
      if (!verified) {
        setError('Ainda não identificamos a confirmação. Clique no link enviado ao seu e-mail e tente novamente.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao verificar status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-6">
        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-700 dark:text-blue-400">
          <MailCheck className="w-6 h-6" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Confirme seu endereço de e-mail
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
            Para proteger a plataforma contra abusos, enviamos um link de verificação para{' '}
            <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
              {firebaseUser?.email}
            </span>
            . Abra o link e depois clique no botão abaixo.
          </p>
        </div>

        {message && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCheck}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
            Já confirmei meu e-mail
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Reenviar e-mail de confirmação
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair desta conta
          </button>
        </div>
      </div>
    </div>
  );
}
