import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import supabase from '@/lib/supabaseClient.js';
import { getProfile } from '@/lib/auth';

interface AuthState {
  session: any;
  profile: any;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supaConfigured = !!supabase;

  const load = async () => {
    if (!supaConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    const user = data.session?.user;
    if (user) {
      try {
        const p = await getProfile(user.id);
        setProfile(p);
      } catch (e) {
        console.warn('Failed to load profile', e);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!supaConfigured) return;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
      } else {
        getProfile(newSession.user.id).then(setProfile).catch(() => {});
      }
    });
    return () => { listener.subscription.unsubscribe(); };
  }, [supaConfigured]);

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, refresh: load, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
