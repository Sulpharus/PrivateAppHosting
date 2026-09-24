// Sensitive actions (admin changes, shared-account remote sessions) need a sign-in within the last
// ten minutes. `useStepUp().run(action)` retries the action once after a quick re-authentication.

import { createContext, type ReactNode, useContext, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog.tsx';
import { isReauthError } from '../lib/api.ts';
import { supabase } from '../lib/supabase.ts';
import { useAuth } from './AuthProvider.tsx';
import { passkeyErrorMessage, passkeysSupported, signInWithPasskey } from './passkeys.ts';

interface StepUp {
  run<T>(action: () => Promise<T>): Promise<T>;
}

const StepUpContext = createContext<StepUp | null>(null);

export function StepUpProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const pending = useRef<{ resolve(): void; reject(error: Error): void } | null>(null);

  const confirm = () =>
    new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setError(null);
      setPassword('');
      setOpen(true);
    });

  const finish = (ok: boolean) => {
    setOpen(false);
    if (ok) pending.current?.resolve();
    else pending.current?.reject(new Error('Bestätigung abgebrochen.'));
    pending.current = null;
  };

  const withPasskey = async () => {
    try {
      await signInWithPasskey();
      finish(true);
    } catch (err) {
      setError(passkeyErrorMessage(err));
    }
  };

  const withPassword = async () => {
    const { error: signInError } = await supabase().auth.signInWithPassword({
      email: profile?.email ?? '',
      password,
    });
    if (signInError) setError('Passwort stimmt nicht.');
    else finish(true);
  };

  const run = async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (err) {
      if (!isReauthError(err)) throw err;
      await confirm();
      return action();
    }
  };

  return (
    <StepUpContext.Provider value={{ run }}>
      {children}
      <Dialog open={open} title="Kurz bestätigen" onClose={() => finish(false)}>
        <p className="muted">Für diese Aktion musst du dich noch einmal bestätigen.</p>
        {passkeysSupported() && (
          <button type="button" className="button primary wide" onClick={withPasskey}>
            Mit Passkey bestätigen
          </button>
        )}
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void withPassword();
          }}
        >
          <label className="field">
            <span>Oder mit Passwort</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit" className="button wide" disabled={!password}>
            Bestätigen
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Dialog>
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUp {
  const value = useContext(StepUpContext);
  if (!value) throw new Error('useStepUp outside StepUpProvider');
  return value;
}
