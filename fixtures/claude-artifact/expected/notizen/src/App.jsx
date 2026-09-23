import { useEffect, useState } from 'react';

// window.storage → mn.kv (per user, synced), window.claude.complete → mn.ai.chat (via ai.mininode.app)
export default function App({ mn }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    mn.kv.get('notes').then((stored) => setNotes(stored ?? []));
  }, [mn]);

  const add = async () => {
    const next = [...notes, { id: crypto.randomUUID(), text }];
    setNotes(next);
    setText('');
    await mn.kv.set('notes', next);
  };

  const summarize = async () => {
    setError('');
    try {
      setSummary(
        await mn.ai.chat(
          `Fasse diese Notizen zusammen:\n${notes.map((note) => note.text).join('\n')}`,
          {
            model: 'claude-haiku',
          },
        ),
      );
    } catch (err) {
      setError(
        err.code === 'budget_exceeded'
          ? 'Das KI-Budget ist für diesen Monat aufgebraucht.'
          : 'Zusammenfassung fehlgeschlagen.',
      );
    }
  };

  return (
    <main>
      <label>
        Neue Notiz
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="button" onClick={add} disabled={!text}>
        Hinzufügen
      </button>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
      </ul>
      <button type="button" onClick={summarize} disabled={notes.length === 0}>
        Zusammenfassen
      </button>
      {summary && <p>{summary}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
