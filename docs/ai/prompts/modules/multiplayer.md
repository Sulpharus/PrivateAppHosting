---
id: multiplayer
title: Mehrspieler
summary: Partien zwischen Nutzern, Züge in Echtzeit, Lobby
order: 100
---

## Feature: multiplayer

- Data mode `group`, so all players read the same match data.
- A match is one kv key `match:<id>` with `players[]` (user ids and display names), `state`,
  `turn`, `version` and `updatedAt`; moves are appended as `move:<matchId>:<n>`.
- Optimistic locking: a move reads the match, checks `version`, writes the new state with
  `version + 1`, and retries or reports "Dein Gegenüber war schneller" when the version moved.
- Realtime: broadcast `{ type: 'move', matchId, version }` on `mn.realtime('match-<id>')`;
  the other client reloads the match. Presence ("Jana ist online") uses the channel's presence.
- Lobby: open matches as `mn-list` rows with a join button; invitations via `mn.notify`.
- Validate every move on the client against the rules before saving; the game must not trust
  a state it did not check.
