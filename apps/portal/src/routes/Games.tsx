import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AppDrawersDialog, DrawerContentDialog, NameDialog } from '../components/DrawerDialogs.tsx';
import { DrawerIcon } from '../components/icons.tsx';
import { ReorderGrid } from '../components/ReorderGrid.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { appUrl, monogram, tintFor } from '../lib/apps.ts';
import { applyOrder, scopeOf } from '../lib/arrange.ts';
import {
  achievements,
  byGenre,
  type GameDay,
  GENRE_LABEL,
  type HubGame,
  type LeaderRow,
  loadDays,
  loadHub,
  loadLeaderboard,
  loadRecent,
  loadUsername,
  longestStreak,
  OUTCOME_LABEL,
  playtime,
  type RecentRound,
  saveUsername,
  statValue,
  streak,
  winRate,
} from '../lib/games.ts';
import { useArrangement } from '../lib/useArrangement.ts';

// Gaming Hub (ADR 0009): every game at a glance, one username for all of them, playtime,
// results and records per game, and leaderboards.

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
const percent = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

function UsernameCard({ onSaved }: { onSaved?: (name: string | null) => void }) {
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadUsername().then(
      (name) => {
        setCurrent(name);
        setValue(name ?? '');
      },
      () => setCurrent(null),
    );
  }, []);

  const save = async (name: string | null) => {
    setBusy(true);
    const problem = await saveUsername(name);
    setBusy(false);
    if (problem) return setMessage({ ok: false, text: problem });
    const clean = name?.trim() || null;
    setCurrent(clean);
    setValue(clean ?? '');
    setMessage({
      ok: true,
      text: clean ? `Du spielst jetzt als ${clean}.` : 'Name entfernt. Du spielst anonym.',
    });
    onSaved?.(clean);
  };

  return (
    <section className="card" aria-labelledby="username-title">
      <h2 id="username-title" className="section-title">
        Spielername
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        Gilt für alle Spiele. Mit Namen erscheinst du in den Bestenlisten, ohne Namen spielst du
        anonym.
      </p>
      <form
        className="row"
        style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
        onSubmit={(event) => {
          event.preventDefault();
          void save(value);
        }}
      >
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          <span>Name</span>
          <input
            value={value}
            maxLength={20}
            autoComplete="nickname"
            placeholder="z. B. Lena_92"
            aria-describedby="username-rule"
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={busy || !value.trim() || value.trim() === current}
        >
          Speichern
        </button>
        {current && (
          <button type="button" className="button" disabled={busy} onClick={() => void save(null)}>
            Entfernen
          </button>
        )}
      </form>
      <p id="username-rule" className="muted" style={{ margin: 0, fontSize: 13 }}>
        3 bis 20 Zeichen: Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich.
      </p>
      {message && (
        <p className={message.ok ? 'pill ok' : 'error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </section>
  );
}

/** Minutes per day over the last 14 days: one hue, the numbers are in the labels. */
function ActivityChart({ days }: { days: GameDay[] }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const cells = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - 13 + i);
    const key = ymd(date);
    const d = byDay.get(key);
    return {
      key,
      label: date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }),
      short: date.toLocaleDateString('de-DE', { weekday: 'narrow' }),
      minutes: Math.round((d?.seconds ?? 0) / 60),
      rounds: d?.results ?? 0,
    };
  });
  const max = Math.max(1, ...cells.map((c) => c.minutes));
  const total = cells.reduce((s, c) => s + c.minutes, 0);
  return (
    <section className="card" aria-labelledby="activity-title">
      <div className="row">
        <h2 id="activity-title" className="section-title">
          Letzte 14 Tage
        </h2>
        <span className="spacer" />
        <span className="muted">{playtime(total * 60)} gespielt</span>
      </div>
      <ul className="game-bars" aria-label="Spielzeit pro Tag">
        {cells.map((c) => {
          const text = `${c.label}: ${c.minutes} Min., ${c.rounds} ${c.rounds === 1 ? 'Runde' : 'Runden'}`;
          return (
            <li key={c.key} title={text}>
              <span className="sr-only">{text}</span>
              <span className="game-bar-track" aria-hidden="true">
                <span
                  className="game-bar"
                  style={{ height: c.minutes ? `${Math.max(6, (c.minutes / max) * 100)}%` : 0 }}
                />
              </span>
              <span className="game-bar-day" aria-hidden="true">
                {c.short}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GameCard({
  game,
  editing,
  onDrawers,
}: {
  game: HubGame;
  editing: boolean;
  onDrawers(): void;
}) {
  const firstRecord = game.stats.find((s) => game.records[s.id] !== undefined);
  return (
    <div className="tile game-tile">
      <Link
        to={`/games/${game.slug}`}
        className="game-tile-link"
        onClick={(event) => {
          if (editing) event.preventDefault();
        }}
      >
        <div className="tile-head">
          <div className="monogram" style={{ background: tintFor(game.slug) }} aria-hidden="true">
            {monogram(game.name)}
          </div>
          <div className="tile-title">
            <strong>{game.name}</strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {game.players === 'solo'
                ? 'Allein'
                : game.players === 'multi'
                  ? 'Mehrspieler'
                  : 'Allein oder zu mehreren'}
            </span>
          </div>
        </div>
        <dl className="game-facts">
          <div>
            <dt>Spielzeit</dt>
            <dd>{playtime(game.seconds)}</dd>
          </div>
          <div>
            <dt>Runden</dt>
            <dd>{game.results.toLocaleString('de-DE')}</dd>
          </div>
          {firstRecord && (
            <div>
              <dt>Rekord {firstRecord.label}</dt>
              <dd>{statValue(firstRecord, game.records[firstRecord.id] ?? 0)}</dd>
            </div>
          )}
        </dl>
        <span className="sr-only">Spielprofil öffnen</span>
      </Link>
      <div className="row" style={{ gap: 8 }}>
        <a
          className="button small primary"
          href={appUrl(game.slug)}
          onClick={(event) => {
            if (editing) event.preventDefault();
          }}
        >
          Spielen
        </a>
        <button
          type="button"
          className="pin"
          aria-label={`${game.name} in Schubladen`}
          onClick={onDrawers}
        >
          <DrawerIcon />
        </button>
      </div>
    </div>
  );
}

export function Games() {
  const [games, setGames] = useState<HubGame[] | null>(null);
  const [days, setDays] = useState<GameDay[]>([]);
  const [recent, setRecent] = useState<RecentRound[]>([]);
  const [error, setError] = useState<string | null>(null);
  const arrange = useArrangement('games');
  const [view, setView] = useState('all');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<
    { kind: 'new' } | { kind: 'rename' | 'fill' } | { kind: 'game'; slug: string } | null
  >(null);

  useEffect(() => {
    Promise.all([loadHub(), loadDays(daysAgo(365)), loadRecent(undefined, 8)]).then(
      ([hub, activity, rounds]) => {
        setGames(hub);
        setDays(activity);
        setRecent(rounds);
      },
      () => setError('Der Gaming Hub konnte nicht geladen werden. Prüfe deine Verbindung.'),
    );
  }, []);

  const totals = useMemo(() => {
    const list = games ?? [];
    const sum = (k: 'seconds' | 'results' | 'wins' | 'losses' | 'draws') =>
      list.reduce((s, g) => s + g[k], 0);
    return {
      seconds: sum('seconds'),
      results: sum('results'),
      rate: winRate({ wins: sum('wins'), losses: sum('losses'), draws: sum('draws') }),
    };
  }, [games]);
  // Days are grouped in Berlin time on the server; the local date matches for users there.
  const current = streak(days, ymd(new Date()));
  const badges = achievements(games ?? [], Math.max(current, longestStreak(days)));
  const openDrawer = view.startsWith('drawer:')
    ? (arrange.drawers.find((d) => d.id === view.slice(7)) ?? null)
    : null;
  const inDrawer = applyOrder(
    (games ?? []).filter((g) => openDrawer?.apps.includes(g.slug)),
    openDrawer ? arrange.orders.get(scopeOf.drawer(openDrawer.id)) : undefined,
  );
  const last = [...(games ?? [])]
    .filter((g) => g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? '').localeCompare(a.lastPlayed ?? ''))[0];

  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 24 }}>
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 40 }}>Gaming Hub</h1>
          <p className="muted">Alle Spiele, deine Spielzeiten, Rekorde und Bestenlisten.</p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!games && !error && <p className="muted">Wird geladen …</p>}

        {games && (
          <>
            <div className="kpis">
              <div className="card kpi">
                <span className="muted">Spielzeit gesamt</span>
                <strong>{playtime(totals.seconds)}</strong>
              </div>
              <div className="card kpi">
                <span className="muted">Runden</span>
                <strong>{totals.results.toLocaleString('de-DE')}</strong>
              </div>
              <div className="card kpi">
                <span className="muted">Siegquote</span>
                <strong>{percent(totals.rate)}</strong>
              </div>
              <div className="card kpi">
                <span className="muted">Serie</span>
                <strong>
                  {current} {current === 1 ? 'Tag' : 'Tage'}
                </strong>
              </div>
            </div>

            <div className="games-grid">
              <div className="stack" style={{ gap: 24 }}>
                {last && (
                  <section className="card continue-card" aria-labelledby="continue-title">
                    <h2 id="continue-title" className="section-title">
                      Weiterspielen
                    </h2>
                    <div className="row">
                      <div
                        className="monogram"
                        style={{ background: tintFor(last.slug) }}
                        aria-hidden="true"
                      >
                        {monogram(last.name)}
                      </div>
                      <div className="stack" style={{ gap: 2 }}>
                        <strong>{last.name}</strong>
                        <span className="muted" style={{ fontSize: 13 }}>
                          Zuletzt {last.lastPlayed ? dateTime(last.lastPlayed) : ''}
                        </span>
                      </div>
                      <span className="spacer" />
                      <a className="button primary" href={appUrl(last.slug)}>
                        Spielen
                      </a>
                    </div>
                  </section>
                )}

                {games.length === 0 && (
                  <p className="empty">
                    Für dich sind noch keine Spiele freigegeben. Spiele erscheinen hier, sobald eine
                    App als Spiel veröffentlicht ist.
                  </p>
                )}
                {games.length > 0 && (
                  <div className="filter-bar">
                    <fieldset className="chip-scroll">
                      <legend className="sr-only">Ansicht</legend>
                      {[
                        ['all', 'Alle', games.length] as const,
                        ...arrange.drawers.map(
                          (d) =>
                            [
                              `drawer:${d.id}`,
                              d.name,
                              d.apps.filter((slug) => games.some((g) => g.slug === slug)).length,
                            ] as const,
                        ),
                      ].map(([id, label, n]) => (
                        <button
                          key={id}
                          type="button"
                          className="chip"
                          aria-pressed={view === id}
                          onClick={() => setView(id)}
                        >
                          {label}
                          <span className="count">{n}</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="chip add"
                        onClick={() => setDialog({ kind: 'new' })}
                      >
                        + Schublade
                      </button>
                    </fieldset>
                    <button
                      type="button"
                      className="button small"
                      aria-pressed={editing}
                      onClick={() => setEditing(!editing)}
                    >
                      {editing ? 'Fertig' : 'Anordnen'}
                    </button>
                  </div>
                )}
                {arrange.error && (
                  <p className="error" role="alert">
                    {arrange.error}
                  </p>
                )}
                {openDrawer && (
                  <div className="drawer-bar">
                    <DrawerIcon />
                    <strong>{openDrawer.name}</strong>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setDialog({ kind: 'fill' })}
                    >
                      Spiele wählen
                    </button>
                    <button
                      type="button"
                      className="button small"
                      onClick={() => setDialog({ kind: 'rename' })}
                    >
                      Umbenennen
                    </button>
                    <button
                      type="button"
                      className="button small danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Schublade „${openDrawer.name}“ löschen? Die Spiele bleiben erhalten.`,
                          )
                        ) {
                          void arrange.remove(openDrawer.id);
                          setView('all');
                        }
                      }}
                    >
                      Löschen
                    </button>
                  </div>
                )}
                {openDrawer ? (
                  <section className="stack" aria-label={openDrawer.name}>
                    {inDrawer.length === 0 && (
                      <p className="empty">Diese Schublade ist noch leer. Wähle „Spiele wählen“.</p>
                    )}
                    <ReorderGrid
                      items={inDrawer}
                      editing={editing}
                      label={(g) => g.name}
                      onReorder={(slugs) =>
                        void arrange.reorder(scopeOf.drawer(openDrawer.id), slugs)
                      }
                      render={(g) => (
                        <GameCard
                          game={g}
                          editing={editing}
                          onDrawers={() => setDialog({ kind: 'game', slug: g.slug })}
                        />
                      )}
                    />
                  </section>
                ) : (
                  byGenre(games).map(([genre, list]) => (
                    <section key={genre} className="stack" aria-labelledby={`genre-${genre}`}>
                      <h2 id={`genre-${genre}`} className="section-title">
                        {GENRE_LABEL[genre]}
                      </h2>
                      <ReorderGrid
                        items={applyOrder(list, arrange.orders.get(scopeOf.genre(genre)))}
                        editing={editing}
                        label={(g) => g.name}
                        onReorder={(slugs) => void arrange.reorder(scopeOf.genre(genre), slugs)}
                        render={(g) => (
                          <GameCard
                            game={g}
                            editing={editing}
                            onDrawers={() => setDialog({ kind: 'game', slug: g.slug })}
                          />
                        )}
                      />
                    </section>
                  ))
                )}
              </div>

              <aside className="stack" style={{ gap: 24 }} aria-label="Dein Spielprofil">
                <UsernameCard />
                <ActivityChart days={days} />
                <section className="card" aria-labelledby="badges-title">
                  <div className="row">
                    <h2 id="badges-title" className="section-title">
                      Erfolge
                    </h2>
                    <span className="spacer" />
                    <span className="muted">
                      {badges.filter((b) => b.done).length} von {badges.length}
                    </span>
                  </div>
                  <ul className="badges">
                    {badges.map((b) => (
                      <li key={b.id} className={b.done ? 'done' : ''}>
                        <strong>{b.title}</strong>
                        <span className="muted">{b.done ? 'Erreicht' : b.hint}</span>
                      </li>
                    ))}
                  </ul>
                </section>
                {recent.length > 0 && (
                  <section className="card" aria-labelledby="recent-title">
                    <h2 id="recent-title" className="section-title">
                      Zuletzt gespielt
                    </h2>
                    <ul className="round-list">
                      {recent.map((r) => (
                        <li key={r.id}>
                          <Link to={`/games/${r.slug}`}>{r.name}</Link>
                          <span className={`pill${r.outcome === 'win' ? ' ok' : ''}`}>
                            {OUTCOME_LABEL[r.outcome]}
                          </span>
                          <span className="muted">{dateTime(r.at)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
      <NameDialog
        open={dialog?.kind === 'new'}
        title="Neue Schublade"
        confirm="Anlegen"
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          setDialog(null);
          void arrange.create(name).then((created) => {
            if (created) setView(`drawer:${created.id}`);
          });
        }}
      />
      <NameDialog
        open={dialog?.kind === 'rename'}
        title="Schublade umbenennen"
        confirm="Speichern"
        initial={openDrawer?.name}
        onClose={() => setDialog(null)}
        onSubmit={(name) => {
          if (openDrawer) void arrange.rename(openDrawer.id, name);
          setDialog(null);
        }}
      />
      <DrawerContentDialog
        open={dialog?.kind === 'fill'}
        drawer={openDrawer}
        options={(games ?? []).map((g) => ({ slug: g.slug, name: g.name }))}
        onClose={() => setDialog(null)}
        onSave={(slugs) => {
          if (openDrawer) void arrange.setApps(openDrawer, slugs);
          setDialog(null);
        }}
      />
      <AppDrawersDialog
        open={dialog?.kind === 'game'}
        slug={dialog?.kind === 'game' ? dialog.slug : ''}
        appName={
          (dialog?.kind === 'game' && games?.find((g) => g.slug === dialog.slug)?.name) || 'Spiel'
        }
        drawers={arrange.drawers}
        onClose={() => setDialog(null)}
        onToggle={(target, member) =>
          dialog?.kind === 'game' &&
          void arrange.setApps(
            target,
            member
              ? [...target.apps, dialog.slug]
              : target.apps.filter((slug) => slug !== dialog.slug),
          )
        }
        onCreate={(name) => {
          if (dialog?.kind !== 'game') return;
          const slug = dialog.slug;
          void arrange.create(name).then((created) => {
            if (created) void arrange.setApps(created, [slug]);
          });
        }}
      />
    </>
  );
}

/** The profile of one game: playtime, results, records, leaderboard and the latest rounds. */
export function GameProfile() {
  const { slug = '' } = useParams();
  const [game, setGame] = useState<HubGame | null | undefined>(undefined);
  const [recent, setRecent] = useState<RecentRound[]>([]);
  const [stat, setStat] = useState<string>('');
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [hasName, setHasName] = useState(true);

  useEffect(() => {
    setGame(undefined);
    Promise.all([loadHub(), loadRecent(slug, 15), loadUsername()]).then(
      ([hub, rounds, name]) => {
        const found = hub.find((g) => g.slug === slug) ?? null;
        setGame(found);
        setRecent(rounds);
        setHasName(Boolean(name));
        setStat(found?.stats[0]?.id ?? '');
      },
      () => setGame(null),
    );
  }, [slug]);

  const [boardError, setBoardError] = useState(false);
  useEffect(() => {
    // Only the answer for the stat on screen is shown, even if an older one arrives later.
    let current = true;
    setBoardError(false);
    if (!stat) {
      setBoard(null);
      return;
    }
    loadLeaderboard(slug, stat).then(
      (rows) => current && setBoard(rows),
      () => {
        if (!current) return;
        setBoard(null);
        setBoardError(true);
      },
    );
    return () => {
      current = false;
    };
  }, [slug, stat]);

  if (game === undefined)
    return (
      <>
        <TopBar />
        <main className="page">
          <p className="muted">Wird geladen …</p>
        </main>
      </>
    );
  if (game === null)
    return (
      <>
        <TopBar />
        <main className="page stack">
          <p className="empty">
            Dieses Spiel gibt es nicht, oder es ist für dich nicht freigegeben.
          </p>
          <Link to="/games">Zum Gaming Hub</Link>
        </main>
      </>
    );

  const def = game.stats.find((s) => s.id === stat);
  return (
    <>
      <TopBar />
      <main className="page stack" style={{ gap: 24, maxWidth: 960 }}>
        <Link to="/games">← Gaming Hub</Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="monogram" style={{ background: tintFor(game.slug) }} aria-hidden="true">
            {monogram(game.name)}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h1 style={{ fontSize: 36 }}>{game.name}</h1>
            <span className="muted">{GENRE_LABEL[game.genre]}</span>
          </div>
          <span className="spacer" />
          <a className="button primary" href={appUrl(game.slug)}>
            Spielen
          </a>
        </div>

        <div className="kpis">
          <div className="card kpi">
            <span className="muted">Spielzeit</span>
            <strong>{playtime(game.seconds)}</strong>
            <span className="muted">
              {game.sessions} {game.sessions === 1 ? 'Sitzung' : 'Sitzungen'}
            </span>
          </div>
          <div className="card kpi">
            <span className="muted">Runden</span>
            <strong>{game.results.toLocaleString('de-DE')}</strong>
            <span className="muted">
              {game.wins} gewonnen · {game.losses} verloren · {game.draws} unentschieden
            </span>
          </div>
          <div className="card kpi">
            <span className="muted">Siegquote</span>
            <strong>{percent(winRate(game))}</strong>
          </div>
        </div>

        {game.stats.length > 0 && (
          <section className="card" aria-labelledby="records-title">
            <h2 id="records-title" className="section-title">
              Deine Rekorde
            </h2>
            <dl className="game-facts">
              {game.stats.map((s) => (
                <div key={s.id}>
                  <dt>
                    {s.label} ({s.better === 'lower' ? 'weniger ist besser' : 'mehr ist besser'})
                  </dt>
                  <dd>
                    {game.records[s.id] === undefined ? '–' : statValue(s, game.records[s.id] ?? 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {game.stats.length > 0 && (
          <section className="card" aria-labelledby="board-title">
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <h2 id="board-title" className="section-title">
                Bestenliste
              </h2>
              <span className="spacer" />
              {game.stats.length > 1 && (
                <label className="field" style={{ minWidth: 160 }}>
                  <span className="sr-only">Wertung</span>
                  <select value={stat} onChange={(event) => setStat(event.target.value)}>
                    {game.stats.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {!hasName && (
              <p className="muted" style={{ margin: 0 }}>
                Du erscheinst nicht in der Bestenliste, solange du keinen Spielernamen hast.{' '}
                <Link to="/games">Namen festlegen</Link>
              </p>
            )}
            {boardError && (
              <p className="error" role="alert">
                Die Bestenliste konnte nicht geladen werden.
              </p>
            )}
            {board && board.length === 0 && <p className="muted">Noch keine Einträge.</p>}
            {board && board.length > 0 && def && (
              <ol className="leaderboard">
                {board.map((row) => (
                  <li key={`${row.rank}-${row.username}`} className={row.mine ? 'mine' : ''}>
                    <span className="rank">{row.rank}.</span>
                    <span className="name">
                      {row.username}
                      {row.mine && <span className="sr-only"> (du)</span>}
                    </span>
                    <span className="value">{statValue(def, row.value)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className="card" aria-labelledby="rounds-title">
          <h2 id="rounds-title" className="section-title">
            Letzte Runden
          </h2>
          {recent.length === 0 && <p className="muted">Noch keine Runde beendet.</p>}
          {recent.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Wann</th>
                    <th>Ergebnis</th>
                    {game.stats.map((s) => (
                      <th key={s.id}>{s.label}</th>
                    ))}
                    <th>Dauer</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td>{dateTime(r.at)}</td>
                      <td>{OUTCOME_LABEL[r.outcome]}</td>
                      {game.stats.map((s) => (
                        <td key={s.id}>
                          {r.stats[s.id] === undefined ? '–' : statValue(s, r.stats[s.id] ?? 0)}
                        </td>
                      ))}
                      <td>
                        {r.seconds === null ? '–' : statValue({ format: 'seconds' }, r.seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
