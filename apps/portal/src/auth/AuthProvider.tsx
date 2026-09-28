import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { platform, supabase } from '../lib/supabase.ts';
import { codeRequired } from './mfa.ts';

export type Role = 'admin' | 'trusted' | 'user';

export interface Profile {
  userId: string;
  displayName: string;
  role: Role;
  email: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  /** Signed in, but the code from the authenticator app is still missing (aal1 of aal2). */
  codePending: boolean;
  profile: Profile | null;
  refreshProfile(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [codePending, setCodePending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (current: Session | null) => {
    if (!current) {
      setProfile(null);
      return;
    }
    const { data } = await platform()
      .from('profiles')
      .select('user_id, display_name, role')
      .eq('user_id', current.user.id)
      .maybeSingle();
    setProfile(
      data
        ? {
            userId: data.user_id as string,
            displayName: data.display_name as string,
            role: data.role as Role,
            email: current.user.email ?? '',
          }
        : null,
    );
  }, []);

  useEffect(() => {
    let active = true;
    supabase()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!active) return;
        setSession(data.session);
        setCodePending(data.session ? await codeRequired() : false);
        await loadProfile(data.session);
        setLoading(false);
      });
    const { data: listener } = supabase().auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Other auth calls inside this callback can deadlock supabase-js, so run them after it.
      setTimeout(() => {
        void (next ? codeRequired() : Promise.resolve(false)).then((pending) => {
          if (active) setCodePending(pending);
        });
        void loadProfile(next);
      }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      codePending,
      profile,
      refreshProfile: () => loadProfile(session),
      async signOut() {
        await supabase().auth.signOut();
      },
    }),
    [loading, session, codePending, profile, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
