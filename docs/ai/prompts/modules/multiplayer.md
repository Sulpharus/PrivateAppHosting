---
id: multiplayer
title: Mehrspieler
summary: Partien zwischen Nutzern, Züge in Echtzeit, Lobby
when: Nimm das, wenn mehrere Leute gegeneinander spielen, Zug um Zug in Echtzeit.
order: 100
group: spiele
---

## Feature: multiplayer

- Data mode `group`, so all players read the same match data.
- Tables: `matches` (`id`, `players jsonb` (user ids and the Gaming Hub username from
  `mn.game.username()`, falling back to the display name), `state jsonb`, `turn integer`, `status
  text check (status in ('open','running','done'))`, timestamps) and `moves` (`match_id … references
  matches on delete cascade`, `n integer not null`, `by uuid`, `move jsonb`, `unique (match_id, n)`).
- Turns without races: a move is an **insert** of move `n + 1` with `mn.db.from('moves').insert(…)`
  (online). The unique constraint makes the database the referee: when the insert fails with a
  duplicate key (`23505`), the other player was faster; reload and say "Dein Gegenüber war
  schneller". Then update `matches.state` and `turn` from the moves.
- Realtime: broadcast `{ type: 'move', matchId, n }` on `mn.realtime('match-<id>')`; the other
  client reloads the moves. Presence ("Jana ist online") uses the channel's presence.
- Lobby: open matches as `mn-list` rows with a join button, updated live. The browser cannot push
  to another person: show invitations in the lobby and as a badge, never promise a notification.
- Validate every move against the rules before saving and when loading; the game must not trust a
  state it did not check.
- Report the finished match with `mn.game.result('win' | 'loss' | 'draw', …)` for each player
  on their own device; the manifest's `game.players` is `multi` or `both`.
