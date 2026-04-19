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
    id: 'forest-green',
    name: 'Forest Green',
    description: 'Deep black with dark forest green',
    swatch: '#1A5C35',
    accentSwatch: '#0D3D22',
    vars: {
      '--background': '0 0% 3%',
      '--foreground': '140 8% 94%',
      '--card': '140 10% 6%',
      '--card-foreground': '140 8% 94%',
      '--popover': '140 10% 6%',
      '--popover-foreground': '140 8% 94%',
      '--primary': '145 60% 22%',
      '--primary-foreground': '140 8% 94%',
      '--secondary': '140 8% 11%',
      '--secondary-foreground': '140 8% 94%',
      '--muted': '140 8% 11%',
      '--muted-foreground': '140 5% 48%',
      '--accent': '145 45% 30%',
      '--accent-foreground': '140 8% 94%',
      '--border': '140 8% 14%',
      '--input': '140 8% 14%',
      '--ring': '145 60% 22%',
      '--sidebar': '140 10% 6%',
      '--sidebar-foreground': '140 8% 94%',
      '--sidebar-primary': '145 60% 22%',
      '--sidebar-accent': '140 8% 11%',
      '--sidebar-border': '140 8% 14%',
    },
  },
  {
    id: 'dark-blue',
    name: 'Dark Blue',
    description: 'Near-black with deep navy blue',
    swatch: '#0F2D6B',
    accentSwatch: '#0A1F4E',
    vars: {
      '--background': '222 35% 4%',
      '--foreground': '215 15% 94%',
      '--card': '222 32% 7%',
      '--card-foreground': '215 15% 94%',
      '--popover': '222 32% 7%',
      '--popover-foreground': '215 15% 94%',
      '--primary': '220 70% 25%',
      '--primary-foreground': '215 15% 94%',
      '--secondary': '222 22% 12%',
      '--secondary-foreground': '215 15% 94%',
      '--muted': '222 22% 12%',
      '--muted-foreground': '218 12% 48%',
      '--accent': '220 55% 32%',
      '--accent-foreground': '215 15% 94%',
      '--border': '222 20% 15%',
      '--input': '222 20% 15%',
      '--ring': '220 70% 25%',
      '--sidebar': '222 32% 7%',
      '--sidebar-foreground': '215 15% 94%',
      '--sidebar-primary': '220 70% 25%',
      '--sidebar-accent': '222 22% 12%',
      '--sidebar-border': '222 20% 15%',
    },
  },
  {
    id: 'dark-red',
    name: 'Dark Red',
    description: 'Black with deep blood red',
    swatch: '#6B0F0F',
    accentSwatch: '#4A0A0A',
    vars: {
      '--background': '0 0% 3%',
      '--foreground': '0 8% 94%',
      '--card': '0 12% 6%',
      '--card-foreground': '0 8% 94%',
      '--popover': '0 12% 6%',
      '--popover-foreground': '0 8% 94%',
      '--primary': '0 72% 25%',
      '--primary-foreground': '0 8% 94%',
      '--secondary': '0 8% 11%',
      '--secondary-foreground': '0 8% 94%',
      '--muted': '0 8% 11%',
      '--muted-foreground': '0 5% 48%',
      '--accent': '0 55% 32%',
      '--accent-foreground': '0 8% 94%',
      '--border': '0 8% 14%',
      '--input': '0 8% 14%',
      '--ring': '0 72% 25%',
      '--sidebar': '0 12% 6%',
      '--sidebar-foreground': '0 8% 94%',
      '--sidebar-primary': '0 72% 25%',
      '--sidebar-accent': '0 8% 11%',
      '--sidebar-border': '0 8% 14%',
    },
  },
  {
    id: 'dark-purple',
    name: 'Dark Purple',
    description: 'Black with deep royal purple',
    swatch: '#3D1060',
    accentSwatch: '#280A42',
    vars: {
      '--background': '270 20% 3%',
      '--foreground': '270 8% 94%',
      '--card': '270 18% 6%',
      '--card-foreground': '270 8% 94%',
      '--popover': '270 18% 6%',
      '--popover-foreground': '270 8% 94%',
      '--primary': '272 65% 24%',
      '--primary-foreground': '270 8% 94%',
      '--secondary': '270 12% 11%',
      '--secondary-foreground': '270 8% 94%',
      '--muted': '270 12% 11%',
      '--muted-foreground': '270 6% 48%',
      '--accent': '272 50% 32%',
      '--accent-foreground': '270 8% 94%',
      '--border': '270 10% 14%',
      '--input': '270 10% 14%',
      '--ring': '272 65% 24%',
      '--sidebar': '270 18% 6%',
      '--sidebar-foreground': '270 8% 94%',
      '--sidebar-primary': '272 65% 24%',
      '--sidebar-accent': '270 12% 11%',
      '--sidebar-border': '270 10% 14%',
    },
  },
  {
    id: 'hot-pink',
    name: 'Hot Pink',
    description: 'Black with deep magenta pink',
    swatch: '#8B0057',
    accentSwatch: '#5C003A',
    vars: {
      '--background': '320 15% 3%',
      '--foreground': '320 8% 94%',
      '--card': '320 14% 6%',
      '--card-foreground': '320 8% 94%',
      '--popover': '320 14% 6%',
      '--popover-foreground': '320 8% 94%',
      '--primary': '325 80% 27%',
      '--primary-foreground': '320 8% 94%',
      '--secondary': '320 10% 11%',
      '--secondary-foreground': '320 8% 94%',
      '--muted': '320 10% 11%',
      '--muted-foreground': '320 5% 48%',
      '--accent': '325 60% 34%',
      '--accent-foreground': '320 8% 94%',
      '--border': '320 10% 14%',
      '--input': '320 10% 14%',
      '--ring': '325 80% 27%',
      '--sidebar': '320 14% 6%',
      '--sidebar-foreground': '320 8% 94%',
      '--sidebar-primary': '325 80% 27%',
      '--sidebar-accent': '320 10% 11%',
      '--sidebar-border': '320 10% 14%',
    },
  },
  {
    id: 'burnt-orange',
    name: 'Burnt Orange',
    description: 'Black with deep burnt orange',
    swatch: '#7A2E00',
    accentSwatch: '#521F00',
    vars: {
      '--background': '20 15% 3%',
      '--foreground': '25 8% 94%',
      '--card': '20 14% 6%',
      '--card-foreground': '25 8% 94%',
      '--popover': '20 14% 6%',
      '--popover-foreground': '25 8% 94%',
      '--primary': '22 90% 24%',
      '--primary-foreground': '25 8% 94%',
      '--secondary': '20 10% 11%',
      '--secondary-foreground': '25 8% 94%',
      '--muted': '20 10% 11%',
      '--muted-foreground': '22 5% 48%',
      '--accent': '22 70% 32%',
      '--accent-foreground': '25 8% 94%',
      '--border': '20 10% 14%',
      '--input': '20 10% 14%',
      '--ring': '22 90% 24%',
      '--sidebar': '20 14% 6%',
      '--sidebar-foreground': '25 8% 94%',
      '--sidebar-primary': '22 90% 24%',
      '--sidebar-accent': '20 10% 11%',
      '--sidebar-border': '20 10% 14%',
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
  themeId: 'forest-green',
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
