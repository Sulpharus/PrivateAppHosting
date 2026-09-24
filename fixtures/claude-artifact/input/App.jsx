import { useEffect, useState } from 'react';

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    window.storage.get('notes').then((stored) => setNotes(stored ? JSON.parse(stored.value) : []));
  }, []);

  const add = async () => {
    const next = [...notes, text];
    setNotes(next);
    setText('');
    await window.storage.set('notes', JSON.stringify(next));
  };

  const summarize = async () => {
    setSummary(await window.claude.complete(`Fasse diese Notizen zusammen:\n${notes.join('\n')}`));
  };

  return (
    <div className="p-6 space-y-4">
      <input value={text} onChange={(e) => setText(e.target.value)} className="border p-2" />
      <button onClick={add}>Hinzufügen</button>
      <ul>{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>
      <button onClick={summarize}>Zusammenfassen</button>
      <p>{summary}</p>
    </div>
  );
}
