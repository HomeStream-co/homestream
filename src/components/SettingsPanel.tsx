/**
 * SettingsPanel — cog-wheel dropdown in the header.
 *
 * Sections:
 *  1. Appearance  — theme picker (6 dark themes) + player color sync
 *  2. Playback    — autoplay next, auto-resume, auto-skip intro, default quality
 *  3. Library     — show storage savings badges, show enrichment tags
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings, Check, Palette, Play, Library,
  Monitor, Zap, SkipForward, RotateCcw, Tag, HardDrive,
  Compass, RefreshCw, Clock, WifiOff,
} from 'lucide-react';
import { useTheme, THEMES, type AppSettings } from '@/context/ThemeContext';

// ── Small reusable toggle ─────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  icon?: React.ElementType;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0 group-hover:text-foreground transition-colors" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-tight">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</p>}
      </div>
      {/* Toggle pill */}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3 pb-1">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{label}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SettingsPanel() {
  const { settings, activeTheme, setTheme, updateSetting } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // TMDB refresh state
  const [tmdbRefreshing, setTmdbRefreshing] = useState(false);
  const [tmdbLastRefreshed, setTmdbLastRefreshed] = useState<string | null>(() => {
    try {
      const raw = sessionStorage.getItem('homestream-tmdb-session');
      if (!raw) return null;
      const data = JSON.parse(raw) as { fetchedAt?: number };
      return data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null;
    } catch { return null; }
  });
  const [tmdbStale, setTmdbStale] = useState(false);

  const handleTmdbRefresh = async () => {
    setTmdbRefreshing(true);
    try {
      const res = await fetch('/api/tmdb?refresh=1');
      if (res.ok) {
        const data = await res.json() as { fetchedAt?: number; stale?: boolean };
        // Update session cache so the hook picks it up on next render
        const existing = (() => {
          try { return JSON.parse(sessionStorage.getItem('homestream-tmdb-session') || '{}'); }
          catch { return {}; }
        })();
        sessionStorage.setItem('homestream-tmdb-session', JSON.stringify({ ...existing, ...data }));
        setTmdbLastRefreshed(data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : null);
        setTmdbStale(data.stale ?? false);
      }
    } catch {
      setTmdbStale(true);
    } finally {
      setTmdbRefreshing(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    updateSetting(key, value);
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Cog button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        title="Settings"
        className={`p-2 rounded-lg transition-colors ${
          open
            ? 'bg-primary/15 text-primary'
            : 'text-muted-foreground hover:text-foreground hover:bg-card'
        }`}
      >
        <motion.div
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <Settings className="w-5 h-5" />
        </motion.div>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Settings</span>
              </div>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full border font-medium"
                style={{
                  borderColor: `hsl(${activeTheme.vars['--primary']})`,
                  color: `hsl(${activeTheme.vars['--primary']})`,
                  background: `hsl(${activeTheme.vars['--primary']} / 0.1)`,
                }}
              >
                {activeTheme.name}
              </span>
            </div>

            <div className="max-h-[calc(100vh-120px)] overflow-y-auto">

              {/* ── 1. Appearance ── */}
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
                      {/* Dual swatch */}
                      <div className="flex gap-0.5 rounded-full overflow-hidden w-8 h-4 flex-shrink-0">
                        <div className="flex-1" style={{ background: theme.swatch }} />
                        <div className="flex-1" style={{ background: theme.accentSwatch }} />
                      </div>
                      <span className="text-[10px] text-center leading-tight text-foreground font-medium line-clamp-2">
                        {theme.name}
                      </span>
                      {settings.themeId === theme.id && (
                        <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Player color sync */}
                <div className="mt-2 border-t border-border/50 pt-2">
                  <Toggle
                    checked={settings.syncPlayerColor}
                    onChange={v => set('syncPlayerColor', v)}
                    label="Sync player accent color"
                    description="Tints the video player controls to match the active theme"
                    icon={Monitor}
                  />
                </div>
              </div>

              {/* ── 2. Playback ── */}
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
                </div>
              </div>

              {/* ── 3. Library ── */}
              <div className="border-t border-border/50">
                <SectionHeader icon={Library} label="Library" />
                <div className="px-4 pb-3 divide-y divide-border/30">
                  <Toggle
                    checked={settings.showStorageBadges}
                    onChange={v => set('showStorageBadges', v)}
                    label="Storage savings badges"
                    description="Show how much disk space was saved after transcoding"
                    icon={HardDrive}
                  />
                  <Toggle
                    checked={settings.showEnrichmentTags}
                    onChange={v => set('showEnrichmentTags', v)}
                    label="AI enrichment tags"
                    description="Show mood and genre tags on media cards"
                    icon={Tag}
                  />
                </div>
              </div>

              {/* ── 4. Discover / TMDB ── */}
              <div className="border-t border-border/50">
                <SectionHeader icon={Compass} label="Discover" />
                <div className="px-4 pb-4 space-y-3">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Movie data is cached for 30 days to keep things fast. Use the button below to pull the latest new releases and trending titles right now.
                  </p>

                  {/* Last refreshed */}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    {tmdbLastRefreshed
                      ? `Last updated: ${tmdbLastRefreshed}`
                      : 'Not yet fetched — will load on first visit to Discover'}
                    {tmdbStale && (
                      <span className="flex items-center gap-1 text-orange-400 ml-1">
                        <WifiOff className="w-2.5 h-2.5" />
                        Stale
                      </span>
                    )}
                  </div>

                  {/* Refresh button */}
                  <button
                    onClick={handleTmdbRefresh}
                    disabled={tmdbRefreshing}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${tmdbRefreshing ? 'animate-spin' : ''}`} />
                    {tmdbRefreshing ? 'Refreshing…' : 'Refresh New Releases Now'}
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
