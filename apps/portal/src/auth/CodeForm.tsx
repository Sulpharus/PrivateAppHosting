import { useState } from 'react';
import { mfaErrorMessage, verifyCode } from './mfa.ts';

/** The six-digit code from the authenticator app. Calls `onDone` once the session is aal2. */
export function CodeForm({ onDone, onCancel }: { onDone(): void; onCancel?: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await verifyCode(code);
      onDone();
    } catch (err) {
      setError(mfaErrorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="field">
        <span>Code aus deiner Authenticator-App</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
          // biome-ignore lint/a11y/noAutofocus: the code is the only thing to do on this step
          autoFocus
        />
      </label>
      <button
        type="submit"
        className="button primary wide"
        disabled={busy || code.replace(/\s/g, '').length !== 6}
      >
        Bestätigen
      </button>
      {onCancel && (
        <button type="button" className="button small" onClick={onCancel}>
          Abbrechen und abmelden
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
