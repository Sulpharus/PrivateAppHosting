// Theme preference: follows the system by default; an explicit choice is kept per device.

export type Theme = 'light' | 'dark';
const KEY = 'mn-theme';

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function applyStoredTheme(): void {
  const theme = stored();
  if (theme) document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // private mode: the choice lasts for this page view
  }
}
