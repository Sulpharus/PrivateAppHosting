import type { Mininode } from '@mininode/sdk';

export interface Recipe {
  title: string;
}

// Was: @google/genai with process.env.API_KEY in the browser. Now the key stays on
// ai.mininode.app and the call is budgeted per user.
export async function suggestRecipes(mn: Mininode, ingredients: string): Promise<Recipe[]> {
  return mn.ai.json<Recipe[]>(
    `Schlage 3 Rezepte mit ${ingredients} vor.`,
    {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
    { model: 'gemini-flash' },
  );
}
