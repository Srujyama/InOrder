// Theme registry. Each theme is a `[data-theme]` token override block in styles.css.
// Here we keep the human metadata + preview swatch so the picker can render chips
// without reading computed CSS. `dark` flags help the picker group them.
export const THEMES = [
  { id: 'blueprint',  name: 'Blueprint',     dark: true,  swatch: { bg: '#0f1419', surface: '#1c2530', accent: '#2dd4d4', text: '#e6edf3' } },
  { id: 'phosphor',   name: 'Phosphor',      dark: true,  swatch: { bg: '#0a0f0a', surface: '#13201a', accent: '#36e07f', text: '#d6f5e0' } },
  { id: 'amber',      name: 'Amber CRT',     dark: true,  swatch: { bg: '#140f08', surface: '#221a0e', accent: '#ffb648', text: '#f3e6cf' } },
  { id: 'plum',       name: 'Plum',          dark: true,  swatch: { bg: '#14101c', surface: '#221b30', accent: '#b07ff0', text: '#ece6f6' } },
  { id: 'crimson',    name: 'Crimson',       dark: true,  swatch: { bg: '#160f11', surface: '#251a1d', accent: '#ff5a6e', text: '#f3e3e6' } },
  { id: 'blueprint-light', name: 'Drafting', dark: false, swatch: { bg: '#e7ecf0', surface: '#f2f5f8', accent: '#0fa3a3', text: '#16222e' } },
  { id: 'sepia',      name: 'Sepia',         dark: false, swatch: { bg: '#efe7d8', surface: '#f7f1e6', accent: '#b5742a', text: '#2c2419' } },
  { id: 'mono',       name: 'Mono',          dark: false, swatch: { bg: '#ececed', surface: '#f7f7f8', accent: '#111418', text: '#16181c' } },
]

export const THEME_IDS = THEMES.map((t) => t.id)
export const DEFAULT_THEME = 'blueprint'

export function isValidTheme(id) {
  return THEME_IDS.includes(id)
}
