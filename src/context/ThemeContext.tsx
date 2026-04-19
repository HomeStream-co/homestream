/**
 * ThemeContext — manages the active color theme and all user preferences
 * that live in the settings panel. Persisted to localStorage.
 *
 * Themes are defined as CSS variable overrides applied to :root at runtime,
 * so no page reload is needed when switching.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

// ── Theme definitions ─────────────────────────────────────────────────────────

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  /** Swatch color shown in the picker */
  swatch: string;
  /** Accent swatch (secondary color) */
  accentSwatch: string;
  vars: Record<string, string>;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'crimson',
    name: 'Crimson Cinema',
    description: 'Classic deep black with Netflix-red',
    swatch: '#E50914',
    accentSwatch: '#F5A623',
    vars: {
      '--background': '0 0% 4%',
      '--foreground': '0 0% 96%',
      '--card': '0 0% 8%',
      '--card-foreground': '0 0% 96%',
      '--popover': '0 0% 8%',
      '--popover-foreground': '0 0% 96%',
      '--primary': '0 86% 47%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '0 0% 14%',
      '--secondary-foreground': '0 0% 96%',
      '--muted': '0 0% 14%',
      '--muted-foreground': '0 0% 46%',
      '--accent': '45 100% 54%',
      '--accent-foreground': '0 0% 0%',
      '--border': '0 0% 18%',
      '--input': '0 0% 18%',
      '--ring': '0 86% 47%',
      '--sidebar': '0 0% 8%',
      '--sidebar-foreground': '0 0% 96%',
      '--sidebar-primary': '0 86% 47%',
      '--sidebar-accent': '0 0% 14%',
      '--sidebar-border': '0 0% 18%',
    },
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Sapphire',
    description: 'Deep navy with electric blue',
    swatch: '#4A90E2',
    accentSwatch: '#E29C4A',
    vars: {
      '--background': '220 30% 5%',
      '--foreground': '210 20% 96%',
      '--card': '220 28% 9%',
      '--card-foreground': '210 20% 96%',
      '--popover': '220 28% 9%',
      '--popover-foreground': '210 20% 96%',
      '--primary': '213 72% 59%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '220 20% 15%',
      '--secondary-foreground': '210 20% 96%',
      '--muted': '220 20% 15%',
      '--muted-foreground': '215 16% 47%',
      '--accent': '35 78% 59%',
      '--accent-foreground': '0 0% 0%',
      '--border': '220 18% 20%',
      '--input': '220 18% 20%',
      '--ring': '213 72% 59%',
      '--sidebar': '220 28% 9%',
      '--sidebar-foreground': '210 20% 96%',
      '--sidebar-primary': '213 72% 59%',
      '--sidebar-accent': '220 20% 15%',
      '--sidebar-border': '220 18% 20%',
    },
  },
  {
    id: 'velvet-violet',
    name: 'Velvet Violet',
    description: 'Rich dark purple with violet glow',
    swatch: '#9B59B6',
    accentSwatch: '#74B659',
    vars: {
      '--background': '270 30% 5%',
      '--foreground': '270 10% 96%',
      '--card': '270 25% 9%',
      '--card-foreground': '270 10% 96%',
      '--popover': '270 25% 9%',
      '--popover-foreground': '270 10% 96%',
      '--primary': '280 47% 54%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '270 15% 15%',
      '--secondary-foreground': '270 10% 96%',
      '--muted': '270 15% 15%',
      '--muted-foreground': '270 8% 46%',
      '--accent': '100 40% 53%',
      '--accent-foreground': '0 0% 0%',
      '--border': '270 12% 20%',
      '--input': '270 12% 20%',
      '--ring': '280 47% 54%',
      '--sidebar': '270 25% 9%',
      '--sidebar-foreground': '270 10% 96%',
      '--sidebar-primary': '280 47% 54%',
      '--sidebar-accent': '270 15% 15%',
      '--sidebar-border': '270 12% 20%',
    },
  },
  {
    id: 'golden-reel',
    name: 'Golden Reel',
    description: 'Warm charcoal with amber gold',
    swatch: '#F5A623',
    accentSwatch: '#4A90E2',
    vars: {
      '--background': '30 8% 6%',
      '--foreground': '40 10% 96%',
      '--card': '30 8% 10%',
      '--card-foreground': '40 10% 96%',
      '--popover': '30 8% 10%',
      '--popover-foreground': '40 10% 96%',
      '--primary': '37 91% 55%',
      '--primary-foreground': '0 0% 0%',
      '--secondary': '30 6% 16%',
      '--secondary-foreground': '40 10% 96%',
      '--muted': '30 6% 16%',
      '--muted-foreground': '35 6% 46%',
      '--accent': '213 72% 59%',
      '--accent-foreground': '0 0% 100%',
      '--border': '30 6% 20%',
      '--input': '30 6% 20%',
      '--ring': '37 91% 55%',
      '--sidebar': '30 8% 10%',
      '--sidebar-foreground': '40 10% 96%',
      '--sidebar-primary': '37 91% 55%',
      '--sidebar-accent': '30 6% 16%',
      '--sidebar-border': '30 6% 20%',
    },
  },
  {
    id: 'emerald-noir',
    name: 'Emerald Noir',
    description: 'Pitch black with neon green',
    swatch: '#10B981',
    accentSwatch: '#F59E0B',
    vars: {
      '--background': '0 0% 3%',
      '--foreground': '150 5% 96%',
      '--card': '150 5% 7%',
      '--card-foreground': '150 5% 96%',
      '--popover': '150 5% 7%',
      '--popover-foreground': '150 5% 96%',
      '--primary': '160 84% 39%',
      '--primary-foreground': '0 0% 0%',
      '--secondary': '150 4% 13%',
      '--secondary-foreground': '150 5% 96%',
      '--muted': '150 4% 13%',
      '--muted-foreground': '150 3% 46%',
      '--accent': '38 92% 50%',
      '--accent-foreground': '0 0% 0%',
      '--border': '150 4% 17%',
      '--input': '150 4% 17%',
      '--ring': '160 84% 39%',
      '--sidebar': '150 5% 7%',
      '--sidebar-foreground': '150 5% 96%',
      '--sidebar-primary': '160 84% 39%',
      '--sidebar-accent': '150 4% 13%',
      '--sidebar-border': '150 4% 17%',
    },
  },
  {
    id: 'slate-mono',
    name: 'Slate Mono',
    description: 'Pure monochrome — no colour distractions',
    swatch: '#94A3B8',
    accentSwatch: '#CBD5E1',
    vars: {
      '--background': '220 13% 5%',
      '--foreground': '220 9% 96%',
      '--card': '220 13% 9%',
      '--card-foreground': '220 9% 96%',
      '--popover': '220 13% 9%',
      '--popover-foreground': '220 9% 96%',
      '--primary': '215 20% 65%',
      '--primary-foreground': '0 0% 0%',
      '--secondary': '220 10% 15%',
      '--secondary-foreground': '220 9% 96%',
      '--muted': '220 10% 15%',
      '--muted-foreground': '220 8% 46%',
      '--accent': '220 14% 75%',
      '--accent-foreground': '0 0% 0%',
      '--border': '220 10% 20%',
      '--input': '220 10% 20%',
      '--ring': '215 20% 65%',
      '--sidebar': '220 13% 9%',
      '--sidebar-foreground': '220 9% 96%',
      '--sidebar-primary': '215 20% 65%',
      '--sidebar-accent': '220 10% 15%',
      '--sidebar-border': '220 10% 20%',
    },
  },
];

// ── Settings state ────────────────────────────────────────────────────────────

export interface AppSettings {
  themeId: string;
  /** Tint the video player controls/UI to match the active theme's primary */
  syncPlayerColor: boolean;
  /** Show storage savings badges on library cards */
  showStorageBadges: boolean;
  /** Auto-play next episode/recommendation after watch */
  autoplayNext: boolean;
  /** Show AI enrichment tags on media cards in browse/home */
  showEnrichmentTags: boolean;
  /** Default playback quality hint (passed to video element) */
  defaultQuality: 'auto' | '1080p' | '720p' | '480p';
  /** Skip intro automatically when Skip Intro button appears */
  autoSkipIntro: boolean;
  /** Resume playback from last position automatically */
  autoResume: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'crimson',
  syncPlayerColor: true,
  showStorageBadges: true,
  autoplayNext: true,
  showEnrichmentTags: true,
  defaultQuality: 'auto',
  autoSkipIntro: false,
  autoResume: true,
};

// ── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  settings: AppSettings;
  activeTheme: ThemeDefinition;
  setTheme: (id: string) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'homestream-settings';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

function applyThemeVars(theme: ThemeDefinition) {
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  const activeTheme = THEMES.find(t => t.id === settings.themeId) ?? THEMES[0];

  // Apply CSS vars whenever theme changes
  useEffect(() => {
    applyThemeVars(activeTheme);
  }, [activeTheme]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const setTheme = useCallback((id: string) => {
    setSettings(prev => ({ ...prev, themeId: id }));
  }, []);

  const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <ThemeContext.Provider value={{ settings, activeTheme, setTheme, updateSetting }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
