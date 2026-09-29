// Per-user app settings in mn.kv ("settings"), so they follow the user to every device.
import type { MiniNodeSDK } from './mininode';

export interface AppSettings {
  accent: string;
  /** Search German editions too and show German titles when there is one. */
  preferGermanTitles: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { accent: 'blue', preferGermanTitles: true };

const ACCENTS = ['green', 'blue', 'violet', 'amber', 'rose', 'teal'];

export async function loadSettings(mn: MiniNodeSDK): Promise<AppSettings> {
  const stored = (await mn.kv.get('settings').catch(() => null)) as Partial<AppSettings> | null;
  return {
    accent: ACCENTS.includes(String(stored?.accent))
      ? String(stored?.accent)
      : DEFAULT_SETTINGS.accent,
    preferGermanTitles:
      typeof stored?.preferGermanTitles === 'boolean'
        ? stored.preferGermanTitles
        : DEFAULT_SETTINGS.preferGermanTitles,
  };
}

export async function saveSettings(mn: MiniNodeSDK, settings: AppSettings): Promise<void> {
  await mn.kv.set('settings', {
    accent: settings.accent,
    preferGermanTitles: settings.preferGermanTitles,
  });
}

export function applyAccent(accent: string): void {
  document.documentElement.setAttribute('data-accent', accent);
}

/** The current settings for code outside React (the search). */
let current: AppSettings = DEFAULT_SETTINGS;
export const currentSettings = (): AppSettings => current;
export const setCurrentSettings = (settings: AppSettings): void => {
  current = settings;
};
