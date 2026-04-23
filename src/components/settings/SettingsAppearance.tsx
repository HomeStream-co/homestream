import { Check, Palette, Monitor } from 'lucide-react';
import { useTheme, THEMES } from '@/context/ThemeContext';
import { SectionHeader, Toggle } from './shared';

export default function SettingsAppearance() {
  const { settings, activeTheme, setTheme, updateSetting } = useTheme();

  return (
    <>
      <SectionHeader icon={Palette} label="Appearance" />
      <div className="px-4 pb-2">
        <div className="grid grid-cols-3 gap-2 mt-1">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => setTheme(theme.id)}
              title={theme.name}
              className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                settings.themeId === theme.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-border/80 hover:bg-muted/50'
              }`}
            >
              <div className="flex gap-0.5 rounded-full overflow-hidden w-8 h-4 flex-shrink-0">
                <div className="flex-1" style={{ background: theme.swatch }} />
                <div className="flex-1" style={{ background: theme.accentSwatch }} />
              </div>
              <span className="text-[10px] text-center leading-tight text-foreground font-medium line-clamp-2">{theme.name}</span>
              {settings.themeId === theme.id && (
                <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2 h-2 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
        {/* Theme name badge — mirrors the panel header badge */}
        <div className="mt-2 border-t border-border/50 pt-2">
          <Toggle
            checked={settings.syncPlayerColor}
            onChange={v => updateSetting('syncPlayerColor', v)}
            label="Sync player accent color"
            description="Tints the video player controls to match the active theme"
            icon={Monitor}
          />
        </div>
        {/* Suppress unused-var warning — activeTheme is used by parent header badge */}
        <span className="sr-only">{activeTheme.name}</span>
      </div>
    </>
  );
}
