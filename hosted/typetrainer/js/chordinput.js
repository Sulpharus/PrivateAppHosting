// Telling chords from fast typing, as a pure state machine fed with key events and timestamps.
// It returns actions for the run view: { type: 'char', ch } (type it) or { type: 'chord', chars }.
//
// Rules (the same idea as chord engines like Kanata or CharaChorder):
// - Only letters can form a chord. Any other key types at once, after the letters still waiting.
// - Letters pressed within WINDOW ms of the first form a group. When the window ends, or at the
//   first key release before that, the group is a chord if at least two of its keys are still held
//   (a released key no longer counts). Otherwise its letters are typed in pressing order, so
//   rolling from one key to the next stays normal typing.
// - A chord plays at the first release after that decision; keys pressed later start a new group.
// - A key pressed again while it is still "held" means a release was missed (focus left): the old
//   group is settled first. reset() settles everything, e.g. when the field loses focus.

export const CHORD_WINDOW = 50;

const isLetter = (key) => /^\p{L}$/u.test(key);

export function createChordInput(windowMs = CHORD_WINDOW) {
  let group = null;

  /** Ends the waiting time: a chord (kept until the first release) or typed letters. */
  function decide(forceTyping = false) {
    if (!group || group.decided) return [];
    group.decided = true;
    if (!forceTyping && group.chars.length >= 2 && group.held.size >= 2) {
      group.chord = true;
      return [];
    }
    const out = group.chars.map((ch) => ({ type: 'char', ch }));
    group = null;
    return out;
  }

  return {
    /** Whether letters are waiting for the window to end (the caller sets a timer). */
    get waiting() {
      return Boolean(group && !group.decided);
    },

    down(key, code, time) {
      const out = [];
      if (group && !group.decided && time - group.start > windowMs) out.push(...decide());
      // A missed release: settle the old group before going on.
      if (group?.held.has(code)) {
        out.push(...decide());
        if (group?.chord) group = null;
      }
      if (!isLetter(key)) {
        out.push(...decide(true));
        out.push({ type: 'char', ch: key });
        return out;
      }
      if (!group || group.decided) {
        group = {
          start: time,
          chars: [key],
          codes: new Set([code]),
          held: new Set([code]),
          decided: false,
          chord: false,
        };
        return out;
      }
      group.chars.push(key);
      group.codes.add(code);
      group.held.add(code);
      return out;
    },

    up(code) {
      if (!group || !group.codes.has(code)) return [];
      group.held.delete(code);
      const out = decide();
      if (group?.chord) {
        out.push({ type: 'chord', chars: group.chars });
        group = null;
      }
      return out;
    },

    /** Called when the window has passed. */
    tick(time) {
      if (group && !group.decided && time - group.start >= windowMs) return decide();
      return [];
    },

    /** Letters still waiting are typed now (before Backspace, Enter or a dead key). */
    flush() {
      return decide(true);
    },

    /** Focus left: waiting letters are typed, a chord not yet released is dropped. */
    reset() {
      const out = decide(true);
      group = null;
      return out;
    },
  };
}
