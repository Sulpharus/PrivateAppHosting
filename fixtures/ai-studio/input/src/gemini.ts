import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function suggestRecipes(ingredients: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Schlage 3 Rezepte mit ${ingredients} vor.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING } } } },
    },
  });
  return JSON.parse(response.text ?? '[]') as { title: string }[];
}
