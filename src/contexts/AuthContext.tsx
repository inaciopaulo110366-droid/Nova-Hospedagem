import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  apiFetch,
  getLocalSessionToken,
  setLocalSessionToken,
} from '../lib/api';
import {
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
} from '../lib/firebase';
import type { PlatformLimits, UserProfile } from '../types/platform';

interface AuthContextValue {
  firebaseUser: User | null;
  isLocalSession: boolean;
  profile: UserProfile | null;
  limits: PlatformLimits;
  loading: boolean;
  syncError: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerification: () => Promise<boolean>;
  updateDisplayName: (name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const DEFAULT_LIMITS: PlatformLimits = {
  maxSitesPerUser: 3,
  maxSiteSizeMb: 100,
  allowSignups: true,
  maintenanceMode: false,
  primaryDomain: 'nh.com.br',
  updatedAt: '',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLocalSession, setIsLocalSession] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [limits, setLimits] = useState<PlatformLimits>(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncWithBackendAndFirestore = useCallback(async (user: User, explicitName?: string) => {
    setSyncError(null);
    const data = await apiFetch<{ user: UserProfile; limits: PlatformLimits }>('/api/auth/sync', {
      method: 'POST',
      body: JSON.stringify({ displayName: explicitName || user.displayName || '' }),
    });
    setProfile(data.user);
    setLimits(data.limits);

    // Sync user profile to Firestore when email is verified (required by security rules)
    if (user.emailVerified) {
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: data.user.displayName,
            email: user.email || data.user.email,
            role: data.user.role,
            status: data.user.status,
            sitesCount: 0,
            storageUsedBytes: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(userRef, {
            displayName: data.user.displayName,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        // Log structured Firestore error without blocking backend-verified session
        try {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        } catch (logged) {
          console.warn('Firestore profile sync skipped:', logged);
        }
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        const localToken = getLocalSessionToken();
        if (localToken) {
          try {
            const me = await apiFetch<{ user: UserProfile; limits: PlatformLimits }>('/api/me');
            setIsLocalSession(true);
            setProfile(me.user);
            setLimits(me.limits);
            setSyncError(null);
          } catch {
            setLocalSessionToken(null);
            setIsLocalSession(false);
            setProfile(null);
            setSyncError(null);
          } finally {
            setLoading(false);
          }
          return;
        }
        setIsLocalSession(false);
        setProfile(null);
        setSyncError(null);
        setLoading(false);
        return;
      }

      setLocalSessionToken(null);
      setIsLocalSession(false);
      try {
        await syncWithBackendAndFirestore(user);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao carregar perfil da conta.';
        setSyncError(msg);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [syncWithBackendAndFirestore]);

  const loginWithGoogle = async () => {
    setLocalSessionToken(null);
    setIsLocalSession(false);
    const cred = await signInWithPopup(auth, googleAuthProvider);
    await syncWithBackendAndFirestore(cred.user);
  };

  const loginWithLocalEmail = async (email: string, password: string) => {
    const resp = await fetch('/api/auth/email/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data?.token) {
      throw new Error(data?.error || 'E-mail ou senha incorretos.');
    }
    setLocalSessionToken(data.token);
    setIsLocalSession(true);
    setSyncError(null);
    setProfile(data.user);
    if (data.limits) setLimits(data.limits);
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      setLocalSessionToken(null);
      setIsLocalSession(false);
      await syncWithBackendAndFirestore(cred.user);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (
        raw.includes('auth/operation-not-allowed') ||
        raw.includes('auth/invalid-credential') ||
        raw.includes('auth/user-not-found')
      ) {
        try {
          await loginWithLocalEmail(email, password);
          return;
        } catch (localErr) {
          if (raw.includes('auth/operation-not-allowed')) {
            throw localErr;
          }
          throw err;
        }
      }
      throw err;
    }
  };

  const registerWithEmail = async (name: string, email: string, password: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await sendEmailVerification(cred.user);
      setLocalSessionToken(null);
      setIsLocalSession(false);
      await syncWithBackendAndFirestore(cred.user, name.trim());
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('auth/operation-not-allowed')) {
        const resp = await fetch('/api/auth/email/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data?.token) {
          throw new Error(data?.error || 'Não foi possível criar sua conta.');
        }
        setLocalSessionToken(data.token);
        setIsLocalSession(true);
        setSyncError(null);
        setProfile(data.user);
        if (data.limits) setLimits(data.limits);
        return;
      }
      throw err;
    }
  };

  const sendResetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.includes('auth/operation-not-allowed')) {
        throw new Error(
          'A redefinição automática por e-mail depende de o provedor E-mail/Senha estar habilitado no Firebase Console, ou utilize o acesso com Google.'
        );
      }
      throw err;
    }
  };

  const resendVerification = async () => {
    if (!auth.currentUser) throw new Error('Usuário não autenticado.');
    await sendEmailVerification(auth.currentUser);
  };

  const refreshVerification = async (): Promise<boolean> => {
    if (!auth.currentUser) return isLocalSession;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const updatedUser = auth.currentUser;
    setFirebaseUser(updatedUser);
    if (updatedUser.emailVerified) {
      await syncWithBackendAndFirestore(updatedUser);
    }
    return updatedUser.emailVerified;
  };

  const updateDisplayName = async (name: string) => {
    const clean = name.trim();
    if (clean.length < 2) throw new Error('Informe um nome com pelo menos 2 caracteres.');
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: clean });
      await syncWithBackendAndFirestore(auth.currentUser, clean);
      return;
    }
    if (getLocalSessionToken()) {
      const data = await apiFetch<{ user: UserProfile; limits: PlatformLimits }>('/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ displayName: clean }),
      });
      setProfile(data.user);
      setLimits(data.limits);
      return;
    }
    throw new Error('Usuário não autenticado.');
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await syncWithBackendAndFirestore(auth.currentUser);
      return;
    }
    if (getLocalSessionToken()) {
      const me = await apiFetch<{ user: UserProfile; limits: PlatformLimits }>('/api/me');
      setProfile(me.user);
      setLimits(me.limits);
    }
  };

  const logout = async () => {
    setLocalSessionToken(null);
    setIsLocalSession(false);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        isLocalSession,
        profile,
        limits,
        loading,
        syncError,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendResetPassword,
        resendVerification,
        refreshVerification,
        updateDisplayName,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
