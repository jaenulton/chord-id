export interface Theme {
  name: string;
  id: string;
  colors: {
    primary: string;
    primaryGlow: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
  };
}

export const themes: Theme[] = [
  {
    name: 'Midnight',
    id: 'midnight',
    colors: {
      primary: '#6366f1',
      primaryGlow: '#818cf8',
      secondary: '#8b5cf6',
      accent: '#a78bfa',
      background: '#1e1e2e',
      surface: '#2a2a3e',
      text: '#ffffff',
      textMuted: '#94a3b8',
    },
  },
  {
    name: 'Neon',
    id: 'neon',
    colors: {
      primary: '#00ff88',
      primaryGlow: '#00ff88',
      secondary: '#00ccff',
      accent: '#ff00ff',
      background: '#0f1419',
      surface: '#1a2332',
      text: '#ffffff',
      textMuted: '#7f8c9b',
    },
  },
  {
    name: 'Ember',
    id: 'ember',
    colors: {
      primary: '#f97316',
      primaryGlow: '#fb923c',
      secondary: '#ef4444',
      accent: '#fbbf24',
      background: '#1c1410',
      surface: '#2d2218',
      text: '#ffffff',
      textMuted: '#a8a29e',
    },
  },
  {
    name: 'Matrix',
    id: 'matrix',
    colors: {
      primary: '#22c55e',
      primaryGlow: '#4ade80',
      secondary: '#16a34a',
      accent: '#86efac',
      background: '#0a1a0a',
      surface: '#142814',
      text: '#22c55e',
      textMuted: '#4ade80',
    },
  },
  {
    name: 'Arctic',
    id: 'arctic',
    colors: {
      primary: '#06b6d4',
      primaryGlow: '#22d3ee',
      secondary: '#0ea5e9',
      accent: '#67e8f9',
      background: '#0f1729',
      surface: '#1e293b',
      text: '#ffffff',
      textMuted: '#94a3b8',
    },
  },
  {
    name: 'Sunset',
    id: 'sunset',
    colors: {
      primary: '#ec4899',
      primaryGlow: '#f472b6',
      secondary: '#f97316',
      accent: '#fbbf24',
      background: '#1f1318',
      surface: '#2d1f28',
      text: '#ffffff',
      textMuted: '#d4a5b9',
    },
  },
];

export const getTheme = (id: string): Theme => {
  return themes.find(t => t.id === id) || themes[0];
};
