export type ThemePreference = 'light' | 'dark';
export const THEME_KEY = 'fg.theme';
export function parseTheme(value: string | null, legacyDark = true): ThemePreference {
  if (value === 'light' || value === 'dark') return value;
  return value === 'system' && !legacyDark ? 'light' : 'dark';
}
export function migrateTheme(value: string | null): ThemePreference {
  let legacyDark = true;
  if (value === 'system' && typeof window.matchMedia === 'function') {
    try { legacyDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { /* Dark fallback. */ }
  }
  const theme = parseTheme(value, legacyDark);
  if (value === 'system') {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Retain the fixed choice in this session. */ }
  }
  return theme;
}
export function readTheme(): ThemePreference {
  try { return migrateTheme(window.localStorage.getItem(THEME_KEY)); }
  catch { return 'dark'; }
}
