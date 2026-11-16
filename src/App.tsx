import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthModal } from './components/AuthModal';
import type { AuthModalMode } from './components/AuthModal';
import { Dashboard } from './components/Dashboard';
import { EmailVerificationGate } from './components/EmailVerificationGate';
import { LandingPage } from './components/LandingPage';

function AppShell() {
  const { firebaseUser, isLocalSession, profile, loading, syncError, logout, refreshProfile } = useAuth();
  const [authModal, setAuthModal] = useState<{
    mode: AuthModalMode;
    reservedSlug?: string;
  } | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Carregando NovaHospeda...
        </div>
      </div>
    );
  }

  if (firebaseUser || isLocalSession) {
    if (syncError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Não foi possível acessar o painel
            </h1>
            <p className="text-sm text-red-600 dark:text-red-400">{syncError}</p>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void refreshProfile()}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
              >
                Sair da conta
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (firebaseUser && !firebaseUser.emailVerified) {
      return <EmailVerificationGate />;
    }

    if (profile) {
      return <Dashboard />;
    }
  }

  return (
    <>
      <LandingPage
        onOpenAuth={(mode, reservedSlug) => setAuthModal({ mode, reservedSlug })}
      />
      {authModal && (
        <AuthModal
          initialMode={authModal.mode}
          initialSubdomain={authModal.reservedSlug}
          onClose={() => setAuthModal(null)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
