import {
  Play, Zap, RotateCcw, SkipForward, Monitor, Volume2, Subtitles,
} from 'lucide-react';
import { useTheme, type AppSettings } from '@/context/ThemeContext';
import { SectionHeader, Toggle } from './shared';

export default function SettingsPlayback() {
  const { settings, updateSetting } = useTheme();

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSetting(key, value);
  }

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Play} label="Playback" />
      <div className="px-4 pb-2 divide-y divide-border/30">
        <Toggle
          checked={settings.autoplayNext}
          onChange={v => set('autoplayNext', v)}
          label="Autoplay next"
          description="Automatically play a recommendation after watching"
          icon={Zap}
        />
        <Toggle
          checked={settings.autoResume}
          onChange={v => set('autoResume', v)}
          label="Auto-resume"
          description="Pick up where you left off when reopening a title"
          icon={RotateCcw}
        />
        <Toggle
          checked={settings.autoSkipIntro}
          onChange={v => set('autoSkipIntro', v)}
          label="Auto-skip intro"
          description="Skip the intro automatically when the button appears"
          icon={SkipForward}
        />

        {/* Default quality */}
        <div className="flex items-center gap-3 py-2">
          <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-tight">Default quality</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Preferred resolution hint for playback</p>
          </div>
          <select
            value={settings.defaultQuality}
            onChange={e => set('defaultQuality', e.target.value as AppSettings['defaultQuality'])}
            className="text-xs bg-muted border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="auto">Auto</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
          </select>
        </div>

        {/* Default volume */}
        <div className="flex items-center gap-3 py-2">
          <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-tight">Default volume</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Starting volume when a video opens</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settings.defaultVolume}
              onChange={e => set('defaultVolume', Number(e.target.value))}
              className="w-20 accent-primary cursor-pointer"
            />
            <span className="text-xs text-foreground font-mono w-8 text-right">
              {settings.defaultVolume}%
            </span>
          </div>
        </div>

        {/* Subtitle language */}
        <div className="flex items-center gap-3 py-2">
          <Subtitles className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-tight">Subtitle language</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Auto-select subtitles when available</p>
          </div>
          <select
            value={settings.subtitleLanguage}
            onChange={e => set('subtitleLanguage', e.target.value)}
            className="text-xs bg-muted border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="off">Off</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="it">Italian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="ru">Russian</option>
          </select>
        </div>
      </div>
    </div>
  );
}
