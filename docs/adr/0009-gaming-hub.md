# ADR 0009: Gaming Hub

- Status: accepted
- Date: 2026-09-30

## Context

More small games are being built on MiniNode, most of them by AI tools. Players want to see all
games in one place, their playtime per game, how well they do, and one name that every game and
leaderboard uses. Without a platform feature, each game would keep its own leaderboard in shared
kv, which every user of the app can overwrite, and would ask for its own player name.

## Decision

**A game is an app with a `game` block** in `mininode.json`:
- `genre`: one of `puzzle`, `arcade`, `karten`, `brett`, `quiz`, `wort`, `strategie` or
  `sonstiges`;
- `players`: `solo`, `multi` or `both`;
- up to six `stats`, each with `id`, `label`, `better` (`higher` or `lower`), `format`
  (`number` or `seconds`), `min` (default 0) and an optional `max`.

**Platform tables** hold the data. Only security-definer functions (`search_path = ''`, not for
`anon`) touch them:
- `platform.game_profiles`: one username per person, 3–20 characters, unique regardless of case.
- `platform.game_sessions`: playtime.
- `platform.game_results`: finished rounds, with the outcome (`win`, `loss`, `draw` or `done`),
  the stats and the length.

**A game writes only for itself.** The functions take the game from the page's origin
(`calling_game()` = `calling_app()` + grant + `game` block), never from a parameter.
- `game_session_start` / `game_session_ping`:
  - a ping credits the time since the last one, at most 90 seconds;
  - starting a session closes the player's other open sessions of that game, so parallel tabs
    cannot multiply the time;
  - at most 240 starts per hour (a new session after every tab switch; more than that is
    abuse).
- `game_result`:
  - keeps only declared stats, as numbers within `min`..`max`;
  - at most 300 rounds per hour per player and game, counted under an advisory lock.

**The username belongs to the portal.**
- `game_set_username` works only without an app origin and with MFA satisfied.
- `game_profile` (reading the name) is open to the portal and to games, not to other apps.
- Removing the name also removes the player from every leaderboard.

**Reads:**
- `game_hub()` returns each game one may play, with one's own playtime, rounds, outcomes and
  records. The portal sees all games; a game sees only itself.
- `game_days(from)` gives activity per day in Europe/Berlin time. It is portal only.
- `game_recent(slug?)` gives the latest rounds. A game sees only its own.
- `game_leaderboard(slug, stat)` gives the best value per player:
  - only players with a username appear;
  - it is readable by people who may play the game, from the portal or from that game.

**SDK:** `mn.game` offers `username()`, `track()`, `result()`, `stats()`, `leaderboard()` and
`hubUrl()`.
- `track()` pings every 30 seconds while the page is visible.
- After a pause it starts a new session, so time spent away never counts.

**Portal:**
- `/games` shows the games grouped by genre, with:
  - totals (playtime, rounds, win rate, streak);
  - the last 14 days;
  - "Weiterspielen";
  - the username;
  - achievements derived from the figures, with nothing stored.
- `/games/:slug` is the game profile: records, leaderboard and the latest rounds.
- Games appear only in the hub, never among the apps on the start page. The start page always
  links to the hub ("Gaming Hub" button and the "Spiele" tab), even before a game exists.
  (Changed 2026-10-01; before, games were also tiles on the start page.)

**Construction prompts** gain five modules: Gaming Hub, game loop, levels and daily
challenge, computer opponent, and sound and haptics. The game type points to `mn.game`.
`hosted/memory` is the reference game.

## Consequences

- Leaderboards are client-reported. A player with their own token can post any value within a
  stat's bounds. We accept this: users are invited, the boards are for fun, and bounds keep the
  values plausible. Nothing may be promised for a rank.
- Games need no data mode or kv for scores. Their saved games stay in `mn.kv`.
- Achievements are computed in the portal. New ones need no migration, but they are not visible
  to games.
