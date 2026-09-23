import { mininode } from '@mininode/sdk';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type Recipe, suggestRecipes } from './recipes.ts';
import './styles.css';

const mn = await mininode();
await mn.auth.requireLogin();

function App() {
  const [ingredients, setIngredients] = useState('');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      const result = await suggestRecipes(mn, ingredients);
      setRecipes(result);
      await mn.kv.set('last-ingredients', ingredients);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto grid max-w-xl gap-4 p-6">
      <label className="grid gap-1">
        Zutaten
        <input
          className="min-h-11 rounded border px-3"
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="min-h-11 rounded bg-orange-700 text-white"
        onClick={ask}
        disabled={busy || !ingredients}
      >
        Vorschläge holen
      </button>
      <ul>
        {recipes.map((recipe) => (
          <li key={recipe.title}>{recipe.title}</li>
        ))}
      </ul>
    </main>
  );
}

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
