// "Dein Konto → Benachrichtigungen": push on this device (ADR 0005).

import { useCallback, useEffect, useState } from 'react';
import {
  type DeviceStatus,
  deviceStatus,
  disablePush,
  enablePush,
  pushErrorMessage,
  sendTestPush,
} from '../lib/push.ts';

interface Feedback {
  ok(message: string): void;
  fail(message: string): void;
}

const TEXT: Record<DeviceStatus, string> = {
  on: 'Auf diesem Gerät eingeschaltet. Erinnerungen und Nachrichten deiner Apps kommen auch, wenn keine App offen ist.',
  off: 'Auf diesem Gerät aus. Schalte sie ein, um Erinnerungen deiner Apps auch bei geschlossener App zu bekommen.',
  denied:
    'Im Browser blockiert. Erlaube Benachrichtigungen in den Website-Einstellungen für mininode.app und lade die Seite neu.',
  'install-first':
    'Auf iPhone und iPad erst nach „Zum Home-Bildschirm“: tippe auf Teilen und dann auf „Zum Home-Bildschirm“, öffne MiniNode von dort und schalte sie hier ein.',
  unsupported: 'Dieser Browser unterstützt keine Push-Benachrichtigungen.',
};

export function NotificationsCard({ feedback }: { feedback: Feedback }) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setStatus(await deviceStatus().catch(() => 'unsupported' as const));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      feedback.ok(success);
    } catch (err) {
      feedback.fail(pushErrorMessage(err));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  if (!status) return null;
  return (
    <section className="card" id="notifications" aria-labelledby="notifications-title">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="notifications-title" className="section-title">
            Benachrichtigungen
          </h2>
          <p className="muted">{TEXT[status]}</p>
        </div>
        {status === 'off' && (
          <button
            type="button"
            className="button small primary"
            disabled={busy}
            onClick={() => act(enablePush, 'Benachrichtigungen eingeschaltet.')}
          >
            Einschalten
          </button>
        )}
        {status === 'on' && (
          <span className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="button small"
              disabled={busy}
              onClick={() =>
                act(sendTestPush, 'Testnachricht gesendet. Sie kommt in wenigen Sekunden.')
              }
            >
              Testnachricht
            </button>
            <button
              type="button"
              className="button small danger"
              disabled={busy}
              onClick={() => act(disablePush, 'Benachrichtigungen auf diesem Gerät ausgeschaltet.')}
            >
              Ausschalten
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
