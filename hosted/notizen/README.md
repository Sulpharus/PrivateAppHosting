# Notizen

Test app for **private data**: each user sees only their own notes, synced across devices via
`mn.kv` (one key per note, so parallel saves never collide). Static HTML, no build.

Check: add a note on the PC, open `notizen.mininode.app` on the phone and see it; sign in as a
second user and see an empty list.
