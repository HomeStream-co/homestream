import { Check, Palette, Monitor } from 'lucide-react';
import { useTheme, THEMES } from '@/context/ThemeContext';
import { SectionHeader, Toggle } from './shared';

export default function SettingsAppearance() {
  const { settings, setTheme, updateSetting } = useTheme();

  return (
    <>
      <SectionHeader icon={Palette} label="Appearance" />
      <div className="px-4 pb-2">

        {/* ── Color theme grid ── */}
        <div className="grid grid-cols-5 gap-2 mt-1">
          {THEMES.map(theme => {
            const active = settings.themeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setTheme(theme.id)}
                title={theme.name}
                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all duration-200 ${
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/80 hover:bg-muted/40'
                }`}
              >
                {/* Half-color / half-black circle swatch */}
                <div className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-white/10">
                  {/* Left half — theme color */}
                  <div
                    className="absolute inset-0 w-1/2"
                    style={{ background: theme.swatch }}
                  />
                  {/* Right half — near-black */}
                  <div
                    className="absolute inset-0 left-1/2"
                    style={{ background: '#0a0a0a' }}
                  />
                  {/* Divider line */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                </div>

                {/* Label */}
                <span className="text-[9px] text-center leading-tight text-muted-foreground font-medium line-clamp-2 w-full">
                  {theme.name}
                </span>

                {/* Active checkmark */}
                {active && (
                  <div className="absolute top-1 right-1 w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-1.5 h-1.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 border-t border-border/50 pt-2">
          <Toggle
            checked={settings.syncPlayerColor}
            onChange={v => updateSetting('syncPlayerColor', v)}
            label="Sync player accent color"
            description="Tints the video player controls to match the active theme"
            icon={Monitor}
          />
        </div>
      </div>
    </>
  );
}
