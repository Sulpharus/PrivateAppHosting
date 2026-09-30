import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStepUp } from '../auth/StepUp.tsx';
import { platform } from '../lib/supabase.ts';

// Shared data (ADR 0002): apps ask for record types in mininode.json (`suite.uses`); nothing is
// granted until approved here. The admin may grant less than asked. Where several apps write
// the same type, the order decides whose fields win.

type Access = 'read' | 'create' | 'write' | 'delete';

interface MatrixRow {
  app_slug: string;
  app_name: string;
  type: string;
  type_label: string;
  requested: Access;
  why: string;
  granted: Access | null;
  priority: number | null;
}

const LEVELS: Access[] = ['read', 'create', 'write', 'delete'];
const ACCESS_LABEL: Record<Access, string> = {
  read: 'Lesen',
  create: 'Anlegen',
  write: 'Bearbeiten',
  delete: 'Löschen',
};

export function Suite() {
  const { run } = useStepUp();
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await platform().rpc('admin_suite_matrix');
    if (loadError) {
      setError('Die Freigaben konnten nicht geladen werden.');
      return;
    }
    setRows((data as MatrixRow[] | null) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const guarded = async (action: () => Promise<void>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await run(action);
      setNotice(done);
      await load();
    } catch {
      setError('Änderung fehlgeschlagen.');
    }
  };
  const check = (result: { error: unknown }) => {
    if (result.error) throw result.error;
  };

  const setGrant = (row: MatrixRow, access: Access | null) =>
    void guarded(
      async () =>
        check(
          await platform().rpc('admin_suite_grant', {
            p_app: row.app_slug,
            p_type: row.type,
            p_access: access,
          }),
        ),
      access
        ? `${row.app_name}: ${row.type_label} – ${ACCESS_LABEL[access]} freigegeben.`
        : `${row.app_name}: ${row.type_label} gesperrt.`,
    );

  const byType = useMemo(() => {
    const groups = new Map<string, MatrixRow[]>();
    for (const row of rows ?? []) groups.set(row.type, [...(groups.get(row.type) ?? []), row]);
    return [...groups.values()];
  }, [rows]);

  const move = (list: MatrixRow[], index: number, dir: -1 | 1) => {
    const writers = list.filter((r) => r.granted && r.granted !== 'read');
    const order = [...writers];
    const [item] = order.splice(index, 1);
    if (!item) return;
    order.splice(index + dir, 0, item);
    void guarded(
      async () =>
        check(
          await platform().rpc('admin_suite_priority', {
            p_type: item.type,
            p_apps: order.map((r) => r.app_slug),
          }),
        ),
      `Reihenfolge für ${item.type_label} gespeichert.`,
    );
  };

  const pending = (rows ?? []).filter((r) => !r.granted).length;

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Gemeinsame Daten</h1>
        <p className="muted">
          Welche App welche gemeinsamen Datentypen lesen oder schreiben darf, etwa Termine für den
          Kalender. Apps fragen im Manifest an; ohne Freigabe bekommen sie nichts.
          {pending > 0 && ` ${pending} ${pending === 1 ? 'Anfrage wartet' : 'Anfragen warten'}.`}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pill ok" role="status">
          {notice}
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="empty">Noch keine App fragt gemeinsame Daten an.</p>
      )}

      {byType.map((list) => {
        const first = list[0];
        if (!first) return null;
        const writers = list
          .filter((r) => r.granted && r.granted !== 'read')
          .sort((a, b) => (a.priority ?? 1000) - (b.priority ?? 1000));
        return (
          <section key={first.type} className="card" aria-labelledby={`type-${first.type}`}>
            <h2 id={`type-${first.type}`} className="section-title">
              {first.type_label} <span className="muted mono">{first.type}</span>
            </h2>
            <div className="table-wrap">
              <table className="table table--cards">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Grund</th>
                    <th>Angefragt</th>
                    <th>Freigabe</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row.app_slug}>
                      <td>
                        <strong>{row.app_name}</strong>
                        <div className="muted mono">{row.app_slug}</div>
                      </td>
                      <td data-label="Grund">{row.why}</td>
                      <td data-label="Angefragt">{ACCESS_LABEL[row.requested]}</td>
                      <td data-label="Freigabe">
                        <label className="field">
                          <span className="sr-only">
                            Freigabe für {row.app_name}: {row.type_label}
                          </span>
                          <select
                            value={row.granted ?? ''}
                            onChange={(event) =>
                              setGrant(row, (event.target.value || null) as Access | null)
                            }
                          >
                            <option value="">Nicht freigegeben</option>
                            {LEVELS.slice(0, LEVELS.indexOf(row.requested) + 1).map((level) => (
                              <option key={level} value={level}>
                                {ACCESS_LABEL[level]}
                              </option>
                            ))}
                          </select>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {writers.length > 1 && (
              <div className="stack" style={{ gap: 8 }}>
                <h3 style={{ fontSize: 16 }}>Vorrang beim Schreiben</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Schreiben zwei Apps dasselbe Feld, gilt die weiter oben.
                </p>
                <ol className="stack" style={{ gap: 6, paddingLeft: 20, margin: 0 }}>
                  {writers.map((row, index) => (
                    <li key={row.app_slug}>
                      <div className="row">
                        <span style={{ flex: 1 }}>{row.app_name}</span>
                        <button
                          type="button"
                          className="button small"
                          disabled={index === 0}
                          aria-label={`${row.app_name} nach oben`}
                          onClick={() => move(list, index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="button small"
                          disabled={index === writers.length - 1}
                          aria-label={`${row.app_name} nach unten`}
                          onClick={() => move(list, index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
