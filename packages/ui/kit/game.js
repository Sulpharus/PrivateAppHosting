// Game helpers for the Gaming Hub (ADR 0009), served as /_mininode/game.js next to ui.js. Plain
// script, everything hangs off window.mnGame. It takes the repeated part of every game off the
// game's hands: login and username, playtime, saving a result, the leaderboard list.
//   const mn = await mnGame.connect({ player: '#player', hub: '#hub' })
//     Loads the SDK client, requires login, links the Gaming Hub, greets the player ("Du spielst
//     als …", or a link to set the name). Resolves to null offline: the game still works.
//   const clock = mnGame.timer({ onTick, mn: () => mn })
//     clock.start() begins the timer and playtime tracking (once), clock.stop() ends both,
//     clock.seconds() is the elapsed time, clock.reset() starts over. A penalty (hints) is added
//     with clock.penalty(seconds).
//   await mnGame.report(mn, 'win' | 'loss' | 'draw' | 'done', { time: 91 }, seconds)
//     Saves a finished round; a failure shows a toast and resolves false.
//   await mnGame.leaders(mn, host, { stat: 'time_1', format: mnGame.format.seconds, limit: 5 })
//     Renders the leaderboard of one stat into `host` and resolves to the player's own record.
//   mnGame.format.seconds(75) → '1:15', mnGame.format.number(12345) → '12.345'
//   mnGame.random(n) → a crypto random integer in [0, n)
(() => {
  const format = {
    seconds(total) {
      const s = Math.max(0, Math.round(total));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const rest = String(s % 60).padStart(2, '0');
      return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
    },
    number(value) {
      return Number(value).toLocaleString('de-DE');
    },
  };

  /** A fair random integer in [0, n) (crypto, no modulo bias). */
  function random(n) {
    const limit = Math.floor(2 ** 32 / n) * n;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % n;
  }

  const el = (target) => (typeof target === 'string' ? document.querySelector(target) : target);

  async function connect({ player, hub } = {}) {
    try {
      const mn = await window.mininode.mininode();
      await mn.auth.requireLogin();
      const hubLink = el(hub);
      if (hubLink) hubLink.href = mn.game.hubUrl();
      const box = el(player);
      if (box) {
        const name = await mn.game.username();
        if (name) box.textContent = `Du spielst als ${name}.`;
        else {
          box.textContent = 'Ohne Spielernamen erscheinst du nicht in der Bestenliste. ';
          const link = document.createElement('a');
          link.href = new URL('/games', mn.config.portalUrl).toString();
          link.textContent = 'Namen festlegen';
          box.append(link);
        }
      }
      return mn;
    } catch {
      // Offline or signed out: the game works, nothing is recorded.
      return null;
    }
  }

  function timer({ onTick, mn = () => null } = {}) {
    let startedAt = 0;
    let extra = 0;
    let handle = 0;
    let stopTracking = null;
    const seconds = () => (startedAt ? Math.round((Date.now() - startedAt) / 1000) + extra : extra);
    const api = {
      get running() {
        return handle !== 0;
      },
      seconds,
      start() {
        if (handle) return;
        startedAt = startedAt || Date.now();
        handle = setInterval(() => onTick?.(seconds()), 1000);
        const client = mn();
        if (client && !stopTracking) stopTracking = client.game.track();
      },
      stop() {
        clearInterval(handle);
        handle = 0;
        stopTracking?.();
        stopTracking = null;
        return seconds();
      },
      /** Adds seconds to the clock (a hint costs time); also while it is not running. */
      penalty(add) {
        extra += add;
        onTick?.(seconds());
      },
      reset() {
        api.stop();
        startedAt = 0;
        extra = 0;
        onTick?.(0);
      },
    };
    return api;
  }

  async function report(mn, outcome, stats, seconds) {
    if (!mn) return false;
    try {
      await mn.game.result(outcome, stats, Math.max(1, Math.round(seconds)));
      return true;
    } catch {
      window.mnui?.toast('Das Ergebnis konnte nicht gespeichert werden.');
      return false;
    }
  }

  async function leaders(mn, host, { stat, format: show = format.number, unit = '', limit = 5 }) {
    const target = el(host);
    if (!mn || !target) return undefined;
    try {
      const [stats, rows] = await Promise.all([mn.game.stats(), mn.game.leaderboard(stat, limit)]);
      target.replaceChildren();
      if (!rows.length) {
        const note = document.createElement('p');
        note.className = 'mn-note';
        note.textContent = 'Noch keine Einträge. Spielernamen legst du im Gaming Hub fest.';
        target.append(note);
      } else {
        const list = document.createElement('ol');
        list.className = 'mn-lb';
        for (const row of rows) {
          const item = document.createElement('li');
          if (row.mine) item.className = 'mine';
          const rank = document.createElement('span');
          rank.className = 'mn-lb-rank';
          rank.textContent = `${row.rank}.`;
          const name = document.createElement('span');
          name.textContent = row.mine ? `${row.username} (du)` : row.username;
          const value = document.createElement('span');
          value.className = 'mn-num';
          value.textContent = `${show(row.value)}${unit}`;
          item.append(rank, name, value);
          list.append(item);
        }
        target.append(list);
      }
      return stats.records[stat];
    } catch {
      target.textContent = 'Die Bestenliste ist gerade nicht erreichbar.';
      return undefined;
    }
  }

  window.mnGame = { connect, timer, report, leaders, format, random };
})();
