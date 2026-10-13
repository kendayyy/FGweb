export type ThemePreference = 'light' | 'dark' | 'system';
export const THEME_KEY = 'fg.theme';
export function parseTheme(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function readTheme(): ThemePreference {
  try { return parseTheme(window.localStorage.getItem(THEME_KEY)); }
  catch { return 'system'; }
}
export function resolveTheme(preference: ThemePreference, dark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (dark ? 'dark' : 'light') : preference;
}
