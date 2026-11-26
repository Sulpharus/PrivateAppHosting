// Verwaltung → Einstellungen: switches for the whole installation (platform.instance_settings).

import { useEffect, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { platform } from '../lib/supabase.ts';
import { loadInstanceSettings, rememberSettings } from '../lib/viewer.ts';

export function Settings() {
  const { run } = useStepUp();
  const [externalViewer, setExternalViewer] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    loadInstanceSettings()
      .then((settings) => setExternalViewer(settings.external_viewer))
      .catch(() => setError('Die Einstellungen konnten nicht geladen werden.'));
  }, []);

  const change = async (next: boolean) => {
    setError('');
    setSaved('');
    try {
      await run(async () => {
        const { error: updateError } = await platform()
          .from('instance_settings')
          .update({ external_viewer: next })
          .eq('id', 1);
        if (updateError) throw updateError;
      });
      rememberSettings({ external_viewer: next });
      setExternalViewer(next);
      setSaved(next ? 'Eingeschaltet.' : 'Ausgeschaltet.');
    } catch {
      setError('Die Einstellung konnte nicht gespeichert werden.');
    }
  };

  return (
    <>
      <h1 style={{ fontSize: 36 }}>Einstellungen</h1>
      <section className="card" aria-labelledby="viewer-title">
        <h2 id="viewer-title" className="section-title">
          Externe Seiten im eigenen Viewer
        </h2>
        <p className="muted">
          Gilt für MiniNode als installierte App. Links auf andere Websites öffnen dann in MiniNode
          mit einer eigenen, schlichten Leiste statt unter der Leiste von Chrome. Seiten, die sich
          nicht einbetten lassen (z. B. Google, GitHub, Banken), öffnen automatisch wie bisher.
          Anmeldungen auf fremden Seiten funktionieren im Viewer oft nicht; dafür gibt es in der
          Leiste „Im Browser öffnen“.
        </p>
        <label className="row" style={{ gap: 8, minHeight: 44 }}>
          <input
            type="checkbox"
            checked={externalViewer === true}
            disabled={externalViewer === null}
            onChange={(event) => void change(event.target.checked)}
          />
          Externe Seiten in MiniNode öffnen
        </label>
        {saved && (
          <p className="muted" role="status">
            {saved}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
