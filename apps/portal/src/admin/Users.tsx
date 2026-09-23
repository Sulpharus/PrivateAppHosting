import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { useStepUp } from '../auth/StepUp.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { ApiError, api } from '../lib/api.ts';
import { type AppRow, listApps } from '../lib/apps.ts';
import { platform } from '../lib/supabase.ts';
import { dateTime } from './AdminLayout.tsx';

type Role = 'admin' | 'trusted' | 'user';

interface UserRow {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  app_count: number;
  last_sign_in_at: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: Role;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', trusted: 'Trusted', user: 'User' };
const ROLE_HELP: Record<Role, string> = {
  admin: 'Verwaltet alles: Apps, Nutzer, Remote-Apps und KI-Budget.',
  trusted:
    'Nutzt geteilte Apps und Remote-Apps mit deinem Account, ohne deine Zugangsdaten zu sehen.',
  user: 'Freigegebene Apps mit eigenen, privaten Daten.',
};

function InviteForm(props: { apps: AppRow[]; onCreated(): void }) {
  const { run } = useStepUp();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'trusted'>('user');
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [result, setResult] = useState<{ link: string; emailSent: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setResult(null);
    try {
      const created = await run(() =>
        api<{ link: string; emailSent: boolean }>('/invites', {
          method: 'POST',
          body: { email, role, apps: selected, expiresInDays: days },
        }),
      );
      setResult(created);
      setEmail('');
      setSelected([]);
      props.onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Einladung fehlgeschlagen.');
    }
  };

  const extraApps = props.apps.filter((app) => !app.is_default && app.status !== 'disabled');

  return (
    <section className="card" aria-labelledby="invite-title">
      <h2 id="invite-title" className="section-title">
        Neue Einladung
      </h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span>E-Mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
          <legend className="muted" style={{ fontSize: 14, marginBottom: 6 }}>
            Rolle
          </legend>
          {(['user', 'trusted'] as const).map((value) => (
            <label key={value} className="row" style={{ alignItems: 'flex-start' }}>
              <input
                type="radio"
                name="role"
                checked={role === value}
                onChange={() => setRole(value)}
              />
              <span>
                <strong>{ROLE_LABEL[value]}</strong>
                <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                  {ROLE_HELP[value]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {extraApps.length > 0 && (
          <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0, gap: 8 }}>
            <legend className="muted" style={{ fontSize: 14, marginBottom: 6 }}>
              Zusätzlich zu den Standard-Apps freigeben
            </legend>
            {extraApps.map((app) => (
              <label key={app.slug} className="row">
                <input
                  type="checkbox"
                  checked={selected.includes(app.slug)}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? [...selected, app.slug]
                        : selected.filter((s) => s !== app.slug),
                    )
                  }
                />
                {app.name}
              </label>
            ))}
          </fieldset>
        )}
        <label className="field">
          <span>Link gültig</span>
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as 1 | 7 | 30)}
          >
            <option value={7}>7 Tage</option>
            <option value={1}>24 Stunden</option>
            <option value={30}>30 Tage</option>
          </select>
        </label>
        <button type="submit" className="button primary">
          Einladung senden
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="stack" role="status" style={{ gap: 8 }}>
          <p className="muted">
            {result.emailSent
              ? 'Einladung verschickt.'
              : 'Die E-Mail ging nicht raus – teile den Link direkt:'}
          </p>
          <div className="row">
            <input
              className="mono"
              readOnly
              value={result.link}
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Einladungslink"
            />
            <button
              type="button"
              className="button small"
              onClick={() => void navigator.clipboard.writeText(result.link)}
            >
              Kopieren
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function GrantsDialog(props: {
  user: UserRow | null;
  apps: AppRow[];
  onClose(): void;
  onChanged(): void;
}) {
  const { run } = useStepUp();
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const user = props.user;

  useEffect(() => {
    if (!user) return;
    void platform()
      .from('app_grants')
      .select('app_slug')
      .eq('user_id', user.user_id)
      .then(({ data }) =>
        setGranted(
          new Set(((data as { app_slug: string }[] | null) ?? []).map((row) => row.app_slug)),
        ),
      );
  }, [user]);

  const toggle = async (slug: string, on: boolean) => {
    if (!user) return;
    await run(async () => {
      const query = on
        ? platform().from('app_grants').insert({ user_id: user.user_id, app_slug: slug })
        : platform().from('app_grants').delete().eq('user_id', user.user_id).eq('app_slug', slug);
      const { error } = await query;
      if (error) throw error;
    });
    const next = new Set(granted);
    if (on) next.add(slug);
    else next.delete(slug);
    setGranted(next);
    props.onChanged();
  };

  return (
    <Dialog
      open={Boolean(user)}
      title={`Apps für ${user?.display_name ?? ''}`}
      onClose={props.onClose}
    >
      {props.apps.map((app) => (
        <label key={app.slug} className="row">
          <input
            type="checkbox"
            checked={granted.has(app.slug)}
            onChange={(event) => void toggle(app.slug, event.target.checked)}
          />
          <span>{app.name}</span>
          {app.data_mode === 'shared-account' && <span className="pill accent">geteilt</span>}
        </label>
      ))}
    </Dialog>
  );
}

export function Users() {
  const { profile } = useAuth();
  const { run } = useStepUp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, i] = await Promise.all([
      platform().rpc('admin_list_users'),
      platform().rpc('admin_list_invites'),
    ]);
    setUsers((u.data as UserRow[] | null) ?? []);
    setInvites(
      ((i.data as InviteRow[] | null) ?? []).filter((invite) => invite.status === 'pending'),
    );
  }, []);

  useEffect(() => {
    void load();
    void listApps().then(setApps);
  }, [load]);

  const guarded = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await run(action);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aktion fehlgeschlagen.');
    }
  };

  const setRole = (user: UserRow, role: Role) =>
    guarded(async () => {
      const { error: rpcError } = await platform().rpc('admin_set_role', {
        p_user_id: user.user_id,
        p_role: role,
      });
      if (rpcError) throw rpcError;
    });

  const remove = (user: UserRow) => {
    if (
      !confirm(
        `${user.display_name} (${user.email}) wirklich löschen? Die Daten dieser Person gehen verloren.`,
      )
    )
      return;
    void guarded(() => api(`/admin/users/${user.user_id}`, { method: 'DELETE' }));
  };

  const revoke = (invite: InviteRow) =>
    void guarded(() => api(`/invites/${invite.id}`, { method: 'DELETE' }));

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 36 }}>Nutzer &amp; Rollen</h1>
        <p className="muted">Nur auf Einladung. Ein Login gilt für alle Apps unter mininode.app.</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="kpis">
        {(['admin', 'trusted', 'user'] as Role[]).map((role) => (
          <div key={role} className="card">
            <div className="row">
              <span className="pill accent">{ROLE_LABEL[role]}</span>
              <span className="spacer" />
              <strong style={{ fontSize: 24 }}>
                {users.filter((user) => user.role === role).length}
              </strong>
            </div>
            <p className="muted" style={{ fontSize: 14 }}>
              {ROLE_HELP[role]}
            </p>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name · E-Mail</th>
              <th>Rolle</th>
              <th>Apps</th>
              <th>Zuletzt aktiv</th>
              <th>
                <span className="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.user_id === profile?.userId;
              return (
                <tr key={user.user_id}>
                  <td>
                    <strong>{user.display_name}</strong>
                    <div className="muted">{user.email}</div>
                  </td>
                  <td>
                    {self ? (
                      <span className="pill accent">Admin</span>
                    ) : (
                      <select
                        aria-label={`Rolle von ${user.display_name}`}
                        value={user.role}
                        onChange={(event) => void setRole(user, event.target.value as Role)}
                      >
                        <option value="user">User</option>
                        <option value="trusted">Trusted</option>
                      </select>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setEditing(user)}
                      disabled={self}
                    >
                      {self ? 'alle' : `${user.app_count} bearbeiten`}
                    </button>
                  </td>
                  <td className="muted">
                    {user.last_sign_in_at ? dateTime(user.last_sign_in_at) : 'noch nie'}
                  </td>
                  <td>
                    {!self && (
                      <button
                        type="button"
                        className="button small danger"
                        onClick={() => remove(user)}
                      >
                        Löschen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="home-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <InviteForm apps={apps} onCreated={() => void load()} />
        <section className="card" aria-labelledby="open-invites">
          <h2 id="open-invites" className="section-title">
            Offene Einladungen
          </h2>
          {invites.length === 0 && <p className="muted">Keine offenen Einladungen.</p>}
          {invites.map((invite) => (
            <div key={invite.id} className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{invite.email}</strong>
                <div className="muted" style={{ fontSize: 13 }}>
                  {ROLE_LABEL[invite.role]} · gültig bis {dateTime(invite.expires_at)}
                </div>
              </div>
              <button type="button" className="button small danger" onClick={() => revoke(invite)}>
                Widerrufen
              </button>
            </div>
          ))}
        </section>
      </div>

      <GrantsDialog
        user={editing}
        apps={apps}
        onClose={() => setEditing(null)}
        onChanged={() => void load()}
      />
    </>
  );
}
