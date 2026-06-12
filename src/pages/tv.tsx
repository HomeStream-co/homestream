/**
 * /tv — HomeStream 10-foot TV Interface
 *
 * Designed for TV browsers and Samsung/LG smart TV web browsers.
 * Optimised for D-pad / remote control navigation:
 *
 *  - Large cards (no hover-dependent UI)
 *  - Visible focus rings on every interactive element
 *  - Keyboard arrow-key navigation between zones and cards
 *  - No tiny touch targets — everything is at least 48px
 *  - Minimal text, big posters, instant play on select
 *  - Search via on-screen keyboard (TV browser native)
 *
 * Navigation zones (↑↓ moves between zones, ←→ moves within):
 *   Zone 0 — Nav tab bar  (Home / Movies / Shows / My List)
 *   Zone 1 — Type filter  (All / Movies / Shows) — home tab only
 *   Zone 2 — Genre pills  (All / Action / Drama / …)
 *   Zone 3 — Content rows (card grid)
 *
 *   Enter / OK      — activate focused element / play card
 *   Backspace / Esc — go back to desktop view
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Search, X, Star, Clock, Tv2, Film,
  Home, List, Bookmark, Filter, Smartphone, QrCode,
  User, Check,
} from 'lucide-react';
import { useMedia } from '@/context/MediaContext';
import { useProfile } from '@/context/ProfileContext';
import type { Profile } from '@/context/ProfileContext';
import type { MediaItem } from '@/types/media';

// ── Cookie helpers (TV profile persistence) ───────────────────────────────────
// TV browsers often clear localStorage between sessions (Samsung Tizen, LG webOS).
// We use a long-lived cookie as a fallback so the last-used profile is remembered.

const TV_PROFILE_COOKIE = 'hs-tv-profile';
const COOKIE_MAX_AGE    = 60 * 60 * 24 * 365; // 1 year

function getTvProfileCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp('(?:^|; )' + TV_PROFILE_COOKIE + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function setTvProfileCookie(profileId: string) {
  try {
    document.cookie = `${TV_PROFILE_COOKIE}=${encodeURIComponent(profileId)}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
  } catch { /* ignore */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRuntime(seconds?: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getRating(item: MediaItem): string {
  const r = parseFloat(item.imdbRating ?? '');
  return isNaN(r) ? '' : r.toFixed(1);
}

function getProgress(item: MediaItem, profileId: string): number {
  const pp = item.profileProgress?.[profileId];
  if (pp) return pp.progress ?? 0;
  return item.watchProgress ?? 0;
}

// ── TV Card ───────────────────────────────────────────────────────────────────

interface TvCardProps {
  item: MediaItem;
  focused: boolean;
  profileId: string;
  onPlay: (item: MediaItem) => void;
  cardRef?: React.RefObject<HTMLButtonElement | null>;
}

function TvCard({ item, focused, profileId, onPlay, cardRef }: TvCardProps) {
  const progress = getProgress(item, profileId);
  const rating = getRating(item);

  return (
    <button
      ref={cardRef}
      onClick={() => onPlay(item)}
      className={`relative flex-shrink-0 w-44 rounded-xl overflow-hidden transition-all duration-200 outline-none
        ${focused
          ? 'ring-4 ring-white scale-105 shadow-2xl shadow-black/80 z-10'
          : 'ring-0 scale-100 opacity-80 hover:opacity-100 hover:scale-105 hover:ring-2 hover:ring-white/60'
        }`}
      tabIndex={0}
    >
      {/* Poster */}
      <div className="aspect-[2/3] bg-muted relative">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            {item.type === 'series' ? (
              <Tv2 className="w-12 h-12 text-muted-foreground/30" />
            ) : (
              <Film className="w-12 h-12 text-muted-foreground/30" />
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Play icon on focus */}
        <AnimatePresence>
          {focused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center">
                <Play className="w-7 h-7 text-white fill-white ml-1" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rating badge */}
        {rating && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/70 rounded-md px-1.5 py-0.5">
            <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
            <span className="text-[10px] text-white font-semibold">{rating}</span>
          </div>
        )}

        {/* Progress bar */}
        {progress > 2 && progress < 95 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Watched checkmark */}
        {progress >= 95 && (
          <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-white text-xs font-semibold leading-tight line-clamp-2 drop-shadow-lg">
          {item.title}
        </p>
        <p className="text-white/60 text-[10px] mt-0.5">{item.year}</p>
      </div>
    </button>
  );
}

// ── TV Row ────────────────────────────────────────────────────────────────────

interface TvRowProps {
  label: string;
  items: MediaItem[];
  focusedRow: boolean;
  focusedCol: number;
  profileId: string;
  onPlay: (item: MediaItem) => void;
  rowRef?: React.RefObject<HTMLDivElement | null>;
}

function TvRow({ label, items, focusedRow, focusedCol, profileId, onPlay, rowRef }: TvRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusedCardRef = useRef<HTMLButtonElement | null>(null);

  // Scroll focused card into view within the row
  useEffect(() => {
    if (focusedRow && focusedCardRef.current) {
      focusedCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [focusedRow, focusedCol]);

  // Scroll the row itself into view when it receives D-pad focus
  useEffect(() => {
    if (focusedRow && rowRef?.current) {
      rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedRow, rowRef]);

  if (items.length === 0) return null;

  return (
    <div ref={rowRef} className="mb-8">
      <h2 className={`text-lg font-bold mb-4 px-12 transition-colors ${focusedRow ? 'text-white' : 'text-white/60'}`}>
        {label}
      </h2>
      <div ref={scrollRef} className="flex gap-4 px-12 overflow-x-auto scrollbar-hide pb-2">
        {items.map((item, i) => (
          <TvCard
            key={item.id}
            item={item}
            focused={focusedRow && focusedCol === i}
            profileId={profileId}
            onPlay={onPlay}
            cardRef={focusedRow && focusedCol === i ? focusedCardRef as React.RefObject<HTMLButtonElement | null> : undefined}
          />
        ))}
      </div>
    </div>
  );
}

// ── Hero Banner ───────────────────────────────────────────────────────────────

function TvHero({ item, onPlay }: { item: MediaItem; onPlay: (item: MediaItem) => void }) {
  const rating = getRating(item);

  return (
    <div className="relative h-[50vh] mb-8 overflow-hidden">
      {/* Background */}
      {item.poster && (
        <img
          src={item.poster}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm opacity-40"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

      {/* Content */}
      <div className="relative h-full flex items-end px-12 pb-10">
        <div className="flex gap-8 items-end">
          {/* Poster */}
          {item.poster && (
            <div className="flex-shrink-0 w-32 rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/20">
              <img src={item.poster} alt={item.title} className="w-full aspect-[2/3] object-cover" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {item.type === 'series' && (
                <span className="text-xs font-semibold bg-primary/80 text-primary-foreground px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Series
                </span>
              )}
              {rating && (
                <span className="flex items-center gap-1 text-sm text-yellow-400 font-semibold">
                  <Star className="w-4 h-4 fill-yellow-400" />
                  {rating}
                </span>
              )}
              <span className="text-white/50 text-sm">{item.year}</span>
              {item.totalSeconds && (
                <span className="flex items-center gap-1 text-white/50 text-sm">
                  <Clock className="w-3.5 h-3.5" />
                  {formatRuntime(item.totalSeconds)}
                </span>
              )}
            </div>

            <h1 className="text-4xl font-bold text-white mb-3 leading-tight">{item.title}</h1>

            {(item.genre ?? []).length > 0 && (
              <div className="flex gap-2 mb-3">
                {(item.genre ?? []).slice(0, 3).map(g => (
                  <span key={g} className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            )}

            {item.plot && (
              <p className="text-white/70 text-sm leading-relaxed max-w-xl line-clamp-2">{item.plot}</p>
            )}

            <button
              onClick={() => onPlay(item)}
              className="mt-5 flex items-center gap-3 px-8 py-3 bg-white text-black rounded-xl font-bold text-base hover:bg-white/90 transition-colors focus:outline-none focus:ring-4 focus:ring-white/50"
            >
              <Play className="w-5 h-5 fill-black" />
              Play Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Genre Filter Row ──────────────────────────────────────────────────────────

function TvGenreFilter({
  genres,
  active,
  onChange,
  focusedPill,
}: {
  genres: string[];
  active: string;
  onChange: (g: string) => void;
  /** Index into ['All', ...genres] that has D-pad focus; -1 = none */
  focusedPill: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allPills = ['All', ...genres];

  // Scroll the active pill into view whenever it changes
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLButtonElement>('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  // Scroll the focused pill into view when D-pad moves within this row
  useEffect(() => {
    if (focusedPill < 0) return;
    const btns = scrollRef.current?.querySelectorAll<HTMLButtonElement>('button');
    btns?.[focusedPill]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [focusedPill]);

  if (genres.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-2 px-12 mb-6 overflow-x-auto scrollbar-none"
      style={{ scrollbarWidth: 'none' }}
    >
      {allPills.map((g, i) => {
        const isFocused = focusedPill === i;
        const isActive = active === g;
        return (
          <button
            key={g}
            data-active={isActive}
            onClick={() => onChange(g)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all focus:outline-none ${
              isFocused
                ? 'ring-4 ring-white scale-105 ' + (isActive ? 'bg-primary text-primary-foreground' : 'bg-white/20 text-white')
                : isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}


// ── Type Filter Row (home tab only) ───────────────────────────────────────────

type TypeFilter = 'all' | 'movie' | 'series';

function TvTypeFilter({
  active,
  onChange,
  focusedPill,
}: {
  active: TypeFilter;
  onChange: (t: TypeFilter) => void;
  focusedPill: number;
}) {
  const pills: { id: TypeFilter; label: string; icon: React.ReactNode }[] = [
    { id: 'all',    label: 'All',    icon: <Filter className="w-3.5 h-3.5" /> },
    { id: 'movie',  label: 'Movies', icon: <Film className="w-3.5 h-3.5" /> },
    { id: 'series', label: 'Shows',  icon: <Tv2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex items-center gap-2 px-12 mb-4">
      {pills.map((p, i) => {
        const isFocused = focusedPill === i;
        const isActive = active === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all focus:outline-none ${
              isFocused
                ? 'ring-4 ring-white scale-105 ' + (isActive ? 'bg-white text-black' : 'bg-white/20 text-white')
                : isActive
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
            }`}
          >
            {p.icon}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}



type NavTab = 'home' | 'movies' | 'shows' | 'watchlist';

function TvNav({
  active,
  onChange,
  focusedTab,
}: {
  active: NavTab;
  onChange: (t: NavTab) => void;
  /** Index of the D-pad focused tab; -1 = none */
  focusedTab: number;
}) {
  const tabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Home', icon: <Home className="w-5 h-5" /> },
    { id: 'movies', label: 'Movies', icon: <Film className="w-5 h-5" /> },
    { id: 'shows', label: 'TV Shows', icon: <Tv2 className="w-5 h-5" /> },
    { id: 'watchlist', label: 'My List', icon: <Bookmark className="w-5 h-5" /> },
  ];

  return (
    <div className="flex items-center gap-2 px-12 mb-8">
      {tabs.map((tab, i) => {
        const isFocused = focusedTab === i;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all focus:outline-none ${
              isFocused
                ? 'ring-4 ring-white scale-105 ' + (isActive ? 'bg-white text-black' : 'bg-white/20 text-white')
                : isActive
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ── TV Profile Picker Overlay ─────────────────────────────────────────────────
// Full-screen overlay shown when no profile is active or user wants to switch.
// Stays entirely within /tv — never navigates away.

function TvProfilePicker({
  visible,
  onSelect,
}: {
  visible: boolean;
  onSelect: (profile: Profile) => void;
}) {
  const { profiles, loading } = useProfile();
  const [focused, setFocused] = useState(0);

  // Reset focus when overlay opens
  useEffect(() => { if (visible) setFocused(0); }, [visible]);

  // D-pad navigation within the picker
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused(f => Math.min(f + 1, profiles.length - 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused(f => Math.max(f - 1, 0));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (profiles[focused]) onSelect(profiles[focused]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, profiles, focused, onSelect]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center gap-10"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center">
              <Play className="w-6 h-6 text-primary-foreground fill-primary-foreground ml-0.5" />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">HomeStream</span>
          </div>

          <div className="text-center">
            <h2 className="text-4xl font-bold text-white mb-2">Who's watching?</h2>
            <p className="text-white/50 text-lg">Select your profile to continue</p>
          </div>

          {loading ? (
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <div className="flex flex-wrap justify-center gap-6 max-w-3xl px-8">
              {profiles.map((profile, i) => (
                <button
                  key={profile.id}
                  onClick={() => onSelect(profile)}
                  className={`flex flex-col items-center gap-3 p-6 rounded-2xl transition-all duration-200 focus:outline-none min-w-[120px] ${
                    focused === i
                      ? 'ring-4 ring-white scale-110 bg-white/15'
                      : 'bg-white/5 hover:bg-white/10 hover:scale-105'
                  }`}
                  onFocus={() => setFocused(i)}
                >
                  <div
                    className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${
                      focused === i ? 'ring-4 ring-white/60' : ''
                    }`}
                    style={{ background: 'rgba(255,255,255,0.1)' }}
                  >
                    {profile.avatar}
                  </div>
                  <span className="text-white font-semibold text-base">{profile.name}</span>
                  {profile.restricted && (
                    <span className="text-xs text-white/40 bg-white/10 px-2 py-0.5 rounded-full">Kids</span>
                  )}
                  {focused === i && (
                    <div className="flex items-center gap-1 text-primary text-xs font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      Select
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <p className="text-white/30 text-sm mt-2">
            Use <kbd className="bg-white/10 rounded px-1.5 py-0.5 font-mono text-xs">←→</kbd> to navigate,{' '}
            <kbd className="bg-white/10 rounded px-1.5 py-0.5 font-mono text-xs">OK</kbd> to select
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Not-connected splash ───────────────────────────────────────────────────────

function TvNotConnected({ serverIP }: { serverIP: string }) {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-8 px-12 text-center">
      <title>HomeStream TV</title>
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
        <Play className="w-8 h-8 text-primary-foreground fill-primary-foreground ml-1" />
      </div>
      <div>
        <h1 className="text-4xl font-bold mb-3">HomeStream TV</h1>
        <p className="text-xl text-white/60 max-w-lg">
          Setup not complete, or this browser is pointed at the wrong server.
        </p>
      </div>
      <div className="bg-white/10 rounded-2xl px-8 py-6 max-w-lg w-full">
        <p className="text-white/50 text-sm uppercase tracking-widest mb-4 font-semibold">How to connect</p>
        <ol className="text-left space-y-3 text-white/80 text-lg">
          <li><span className="text-primary font-bold mr-2">1.</span> Open HomeStream on your home PC</li>
          <li><span className="text-primary font-bold mr-2">2.</span> Make sure your TV is on the same WiFi</li>
          <li><span className="text-primary font-bold mr-2">3.</span> Scan the QR code shown on the TV screen, <span className="text-white/50">or</span> type this exact address:</li>
        </ol>
        {serverIP ? (
          <div className="mt-4 bg-black/60 border border-primary/40 rounded-xl px-6 py-5 font-mono text-2xl text-primary font-bold tracking-wide text-center break-all">
            {serverIP}
          </div>
        ) : (
          <div className="mt-4 bg-black/40 rounded-xl px-6 py-4 font-mono text-lg text-white/60 text-center">
            Check HomeStream → Settings → Network for your IP
          </div>
        )}
        <p className="text-white/40 text-sm mt-3">
          ⚠ The port number matters — HomeStream may use 3000, 3001, 3002, etc.<br/>
          Always use the address shown above or scan the QR code.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
      >
        Retry connection
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TvPage() {
  // null = still loading, true = ready, false = server reachable but not set up,
  // 'unreachable' = network error / wrong address
  const [serverReady, setServerReady] = useState<boolean | null | 'unreachable'>(null);
  const [serverIP, setServerIP] = useState('');

  useEffect(() => {
    // Use /api/health — always unauthenticated, includes setupComplete flag.
    // /api/setup requires an auth cookie once setup is done, which the TV
    // browser won't have, causing a false "not connected" screen.
    fetch('/api/health')
      .then(r => r.json())
      .then((d: { setupComplete?: boolean }) => setServerReady(!!d.setupComplete))
      .catch(() => setServerReady('unreachable'));

    fetch('/api/network/info')
      .then(r => r.json())
      .then((d: { primary?: string; port?: string | number }) => {
        // Always prefer the raw LAN IP — hs.local fails on Android and causes
        // SSL errors on devices that have seen an HSTS header before.
        // /api/network/info returns `primary` as the best LAN IP.
        const host = d.primary;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
          setServerIP(`http://${host}:${d.port ?? '3000'}/tv`);
        }
      })
      .catch(() => {}); // non-fatal — ignore
  }, []);

  if (serverReady === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Server is reachable but setup wizard has not been completed yet.
  // Show a clear prompt to complete setup — not the generic "not connected" screen.
  if (serverReady === false) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-8 px-12 text-center">
        <title>HomeStream TV — Setup Required</title>
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
          <Play className="w-8 h-8 text-primary-foreground fill-primary-foreground ml-1" />
        </div>
        <div>
          <h1 className="text-4xl font-bold mb-3">Setup Required</h1>
          <p className="text-xl text-white/60 max-w-lg">
            HomeStream needs to be configured before you can use the TV interface.
          </p>
        </div>
        <div className="bg-white/10 rounded-2xl px-8 py-6 max-w-lg w-full text-left">
          <p className="text-white/50 text-sm uppercase tracking-widest mb-4 font-semibold text-center">How to get started</p>
          <ol className="space-y-3 text-white/80 text-lg">
            <li><span className="text-primary font-bold mr-2">1.</span> Open HomeStream on your home PC</li>
            <li><span className="text-primary font-bold mr-2">2.</span> Complete the setup wizard (takes about 2 minutes)</li>
            <li><span className="text-primary font-bold mr-2">3.</span> Come back to this screen — it will load automatically</li>
          </ol>
        </div>
        <div className="flex flex-col items-center gap-3">
          <a
            href="/setup"
            className="px-8 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg transition-colors"
          >
            Open Setup Wizard
          </a>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Network error — server is not reachable at this address
  if (serverReady === 'unreachable') return <TvNotConnected serverIP={serverIP} />;

  return <TvPageInner />;
}

// ── RowList — stable per-row refs so TvRow can scroll itself into view ────────

interface RowListProps {
  rows: { label: string; items: MediaItem[] }[];
  focusZone: string;
  focusedRow: number;
  focusedCol: number;
  profileId: string;
  onPlay: (item: MediaItem) => void;
}

function RowList({ rows, focusZone, focusedRow, focusedCol, profileId, onPlay }: RowListProps) {
  // One stable ref per row — useRef array pattern
  const rowRefs = useRef<React.RefObject<HTMLDivElement | null>[]>([]);
  // Grow the array as rows are added; never shrink (stale refs are harmless)
  while (rowRefs.current.length < rows.length) {
    rowRefs.current.push({ current: null });
  }

  return (
    <>
      {rows.map((row, rowIdx) => (
        <TvRow
          key={row.label}
          label={row.label}
          items={row.items}
          focusedRow={focusZone === 'content' && focusedRow === rowIdx}
          focusedCol={focusedCol}
          profileId={profileId}
          onPlay={onPlay}
          rowRef={rowRefs.current[rowIdx]}
        />
      ))}
    </>
  );
}

// ── QR Remote Overlay ─────────────────────────────────────────────────────────
// Shows on load for 45 s, then hides. A button in the top bar brings it back.

const QR_AUTO_HIDE_MS = 45_000;

interface QrData {
  qr: string;   // SVG string
  url: string;  // remote URL
  lanIP: string;
}

function QrRemoteOverlay({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible || qrData) return;
    fetch('/api/remote/qr?format=svg')
      .then(r => r.json())
      .then((d: { qr?: string; url?: string; lanIP?: string }) => {
        if (d.qr && d.url) setQrData({ qr: d.qr, url: d.url, lanIP: d.lanIP ?? '' });
        else setError(true);
      })
      .catch(() => setError(true));
  }, [visible, qrData]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' as const }}
          className="fixed bottom-24 right-10 z-50 bg-black/90 backdrop-blur-md border border-white/15 rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-4 w-64"
        >
          {/* Header */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-white">Phone Remote</span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="Close QR code"
            >
              <X className="w-3.5 h-3.5 text-white/70" />
            </button>
          </div>

          {/* QR code */}
          {error ? (
            <div className="w-44 h-44 flex items-center justify-center text-white/30 text-xs text-center">
              Could not generate QR code
            </div>
          ) : qrData ? (
            <div
              className="w-44 h-44 rounded-xl overflow-hidden bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qrData.qr }}
            />
          ) : (
            <div className="w-44 h-44 rounded-xl bg-white/5 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Instructions */}
          <div className="text-center">
            <p className="text-white/60 text-xs leading-relaxed">
              Scan with your phone to use it as a remote control
            </p>
            {qrData?.lanIP && (
              <p className="text-white/30 text-[10px] mt-1 font-mono">{qrData.url}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TvPageInner() {
  const navigate = useNavigate();
  const { library, watchlist: watchlistIds } = useMedia();
  const { activeProfile, profiles, switchProfile } = useProfile();
  const profileId = activeProfile?.id ?? 'adult';

  // ── Profile picker state ──
  // Show picker if no profile is active. Also shown when user clicks "Switch Profile".
  const [showProfilePicker, setShowProfilePicker] = useState(false);
  const profileAutoResumed = useRef(false);

  // On mount: try to auto-resume the last TV profile from cookie or localStorage.
  // This runs once after profiles have loaded so we have valid IDs to match against.
  useEffect(() => {
    if (profileAutoResumed.current) return;
    if (profiles.length === 0) return; // wait for profiles to load
    profileAutoResumed.current = true;

    if (activeProfile) {
      // Already have a profile — persist it to cookie for next session
      setTvProfileCookie(activeProfile.id);
      return;
    }

    // Try cookie first (survives TV browser session clears), then localStorage
    const savedId = getTvProfileCookie()
      ?? (() => { try { return localStorage.getItem('homestream-active-profile'); } catch { return null; } })();

    if (savedId && profiles.find(p => p.id === savedId)) {
      // Auto-resume silently — no picker needed
      switchProfile(savedId).catch(() => setShowProfilePicker(true));
    } else {
      // No saved profile — show the picker
      setShowProfilePicker(true);
    }
  }, [profiles, activeProfile, switchProfile]);

  const handleProfileSelect = useCallback(async (profile: Profile) => {
    try {
      await switchProfile(profile.id);
      setTvProfileCookie(profile.id);
      setShowProfilePicker(false);
    } catch {
      // Fallback: still close picker and use the profile locally
      setShowProfilePicker(false);
    }
  }, [switchProfile]);

  const [tab, setTab] = useState<NavTab>('home');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeGenre, setActiveGenre] = useState('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // ── QR remote overlay ──
  // Auto-shows for 45 s on load, then hides. Button in top bar brings it back.
  const [showQr, setShowQr] = useState(true);
  const qrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    qrTimerRef.current = setTimeout(() => setShowQr(false), QR_AUTO_HIDE_MS);
    return () => { if (qrTimerRef.current) clearTimeout(qrTimerRef.current); };
  }, []);

  function openQr() {
    setShowQr(true);
    // Reset the auto-hide timer each time it's manually opened
    if (qrTimerRef.current) clearTimeout(qrTimerRef.current);
    qrTimerRef.current = setTimeout(() => setShowQr(false), QR_AUTO_HIDE_MS);
  }

  // ── D-pad focus state ──
  // focusZone: which horizontal band the cursor is in
  //   'nav'     — tab bar (Home / Movies / Shows / My List)
  //   'type'    — type filter pills (All / Movies / Shows) — home tab only
  //   'genre'   — genre pills
  //   'content' — card rows
  type FocusZone = 'nav' | 'type' | 'genre' | 'content';
  const [focusZone, setFocusZone] = useState<FocusZone>('content');
  const [focusedNavTab, setFocusedNavTab] = useState(0);   // index into navTabs
  const [focusedTypePill, setFocusedTypePill] = useState(0); // index into type pills
  const [focusedGenrePill, setFocusedGenrePill] = useState(0); // index into ['All', ...genres]
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Derived data ──

  const continueWatching = useMemo(() =>
    library
      .filter(m => {
        const p = getProgress(m, profileId);
        return p > 2 && p < 95;
      })
      .sort((a, b) => {
        const aTime = a.profileProgress?.[profileId]?.lastWatchedAt ?? a.lastWatchedAt ?? '';
        const bTime = b.profileProgress?.[profileId]?.lastWatchedAt ?? b.lastWatchedAt ?? '';
        return bTime.localeCompare(aTime);
      })
      .slice(0, 20),
    [library, profileId]
  );

  const recentlyAdded = useMemo(() =>
    [...library].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')).slice(0, 20),
    [library]
  );

  const movies = useMemo(() =>
    library.filter(m => m.type === 'movie').sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')),
    [library]
  );

  const shows = useMemo(() =>
    library.filter(m => m.type === 'series').sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')),
    [library]
  );

  const watchlist = useMemo(() =>
    library.filter(m => watchlistIds.includes(m.id)),
    [library, watchlistIds]
  );

  const topRated = useMemo(() =>
    [...library]
      .filter(m => parseFloat(m.imdbRating ?? '') >= 7)
      .sort((a, b) => parseFloat(b.imdbRating ?? '0') - parseFloat(a.imdbRating ?? '0'))
      .slice(0, 20),
    [library]
  );

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return library.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.genre ?? []).some(g => g.toLowerCase().includes(q)) ||
      m.director?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [library, search]);

  // ── Rows for current tab ──

  // Pool of items for the current tab (before genre/type filter) — used to derive genre list
  const tabPool = useMemo((): MediaItem[] => {
    switch (tab) {
      case 'home':     return library;
      case 'movies':   return movies;
      case 'shows':    return shows;
      case 'watchlist': return watchlist;
      default:         return [];
    }
  }, [tab, library, movies, shows, watchlist]);

  // All genres present in the current tab pool, sorted alphabetically
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const item of tabPool) {
      for (const g of (item.genre ?? [])) {
        if (g) set.add(g);
      }
    }
    return [...set].sort();
  }, [tabPool]);

  // Apply genre filter to an item list
  const applyGenre = useCallback((items: MediaItem[]) => {
    if (activeGenre === 'All') return items;
    return items.filter(m => (m.genre ?? []).includes(activeGenre));
  }, [activeGenre]);

  // Apply type filter to an item list (home tab only)
  const applyType = useCallback((items: MediaItem[]) => {
    if (typeFilter === 'all') return items;
    return items.filter(m => m.type === typeFilter);
  }, [typeFilter]);

  const rows = useMemo((): { label: string; items: MediaItem[] }[] => {
    if (showSearch) return [{ label: `Results for "${search}"`, items: searchResults }];
    switch (tab) {
      case 'home':
        return [
          ...(continueWatching.length > 0 ? [{ label: 'Continue Watching', items: applyGenre(applyType(continueWatching)) }] : []),
          { label: 'Recently Added', items: applyGenre(applyType(recentlyAdded)) },
          { label: 'Top Rated', items: applyGenre(applyType(topRated)) },
          ...(typeFilter === 'all' || typeFilter === 'movie' ? [{ label: 'Movies', items: applyGenre(movies.slice(0, 20)) }] : []),
          ...(typeFilter === 'all' || typeFilter === 'series' ? [{ label: 'TV Shows', items: applyGenre(shows.slice(0, 20)) }] : []),
        ].filter(r => r.items.length > 0);
      case 'movies':
        return [{ label: activeGenre === 'All' ? 'All Movies' : `${activeGenre} Movies`, items: applyGenre(movies) }];
      case 'shows':
        return [{ label: activeGenre === 'All' ? 'All TV Shows' : `${activeGenre} Shows`, items: applyGenre(shows) }];
      case 'watchlist':
        return [{ label: 'My List', items: applyGenre(watchlist) }];
      default:
        return [];
    }
  }, [tab, showSearch, search, searchResults, continueWatching, recentlyAdded, topRated, movies, shows, watchlist, applyGenre, applyType, activeGenre, typeFilter]);

  // Hero item — first item from continue watching, else first recently added
  const heroItem = continueWatching[0] ?? recentlyAdded[0];

  // Whether the type filter row is visible (home tab, no search)
  const showTypeFilter = tab === 'home' && !showSearch;

  // Nav tab order for D-pad
  const navTabs: NavTab[] = ['home', 'movies', 'shows', 'watchlist'];

  // Genre pills count (including 'All')
  const genrePillCount = availableGenres.length + 1; // +1 for 'All'
  const typePillCount = 3; // All / Movies / Shows

  // ── Zone ordering — which zones are visible and in what vertical order ──
  // Zones present: nav → (type if home) → (genre if pills exist) → content
  const visibleZones = useMemo((): FocusZone[] => {
    if (showSearch) return ['content'];
    const z: FocusZone[] = ['nav'];
    if (showTypeFilter) z.push('type');
    if (genrePillCount > 1) z.push('genre');
    z.push('content');
    return z;
  }, [showSearch, showTypeFilter, genrePillCount]);

  // ── D-pad keyboard navigation ──

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (showSearch) {
      if (e.key === 'Escape') { setShowSearch(false); setSearch(''); }
      return;
    }

    const zoneIdx = visibleZones.indexOf(focusZone);

    switch (e.key) {
      // ── Vertical: move between zones ──
      case 'ArrowDown': {
        e.preventDefault();
        const nextZone = visibleZones[Math.min(zoneIdx + 1, visibleZones.length - 1)];
        setFocusZone(nextZone);
        // Reset column when entering content zone
        if (nextZone === 'content') setFocusedCol(0);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevZone = visibleZones[Math.max(zoneIdx - 1, 0)];
        setFocusZone(prevZone);
        if (prevZone === 'content') setFocusedCol(0);
        break;
      }

      // ── Horizontal: move within zone ──
      case 'ArrowRight': {
        e.preventDefault();
        if (focusZone === 'nav') {
          setFocusedNavTab(i => Math.min(i + 1, navTabs.length - 1));
        } else if (focusZone === 'type') {
          setFocusedTypePill(i => Math.min(i + 1, typePillCount - 1));
        } else if (focusZone === 'genre') {
          setFocusedGenrePill(i => Math.min(i + 1, genrePillCount - 1));
        } else {
          // content zone
          const currentRow = rows[focusedRow];
          if (currentRow) setFocusedCol(c => Math.min(c + 1, currentRow.items.length - 1));
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (focusZone === 'nav') {
          setFocusedNavTab(i => Math.max(i - 1, 0));
        } else if (focusZone === 'type') {
          setFocusedTypePill(i => Math.max(i - 1, 0));
        } else if (focusZone === 'genre') {
          setFocusedGenrePill(i => Math.max(i - 1, 0));
        } else {
          setFocusedCol(c => Math.max(c - 1, 0));
        }
        break;
      }

      // ── Vertical within content zone: move between rows ──
      // (handled separately so ArrowDown in content moves rows, not zones)
      // We override the zone-switch above for content zone:
      // Actually we need to handle row movement inside content separately.
      // Re-handle: ArrowDown in content = next row (not next zone unless last row)

      // ── Enter / OK: activate focused element ──
      case 'Enter': {
        e.preventDefault();
        if (focusZone === 'nav') {
          const newTab = navTabs[focusedNavTab];
          if (newTab) setTab(newTab);
        } else if (focusZone === 'type') {
          const types: TypeFilter[] = ['all', 'movie', 'series'];
          const t = types[focusedTypePill];
          if (t) setTypeFilter(t);
        } else if (focusZone === 'genre') {
          const allPills = ['All', ...availableGenres];
          const g = allPills[focusedGenrePill];
          if (g) setActiveGenre(g);
        } else {
          const item = rows[focusedRow]?.items[focusedCol];
          if (item) handlePlay(item);
        }
        break;
      }

      case 'Backspace':
      case 'Escape':
        e.preventDefault();
        navigate('/');
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, focusedRow, focusedCol, focusZone, focusedNavTab, focusedTypePill, focusedGenrePill, showSearch, navigate, visibleZones, navTabs, genrePillCount, typePillCount, availableGenres]);

  // Override ArrowDown/Up inside content zone to move rows first, then exit zone
  const handleKeyDownContent = useCallback((e: KeyboardEvent) => {
    if (focusZone !== 'content') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (focusedRow < rows.length - 1) {
        setFocusedRow(r => r + 1);
        setFocusedCol(0);
      } else {
        // Already at last row — stay (no zone below content)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (focusedRow > 0) {
        setFocusedRow(r => r - 1);
        setFocusedCol(0);
      } else {
        // At first row — move up to previous zone
        const zoneIdx = visibleZones.indexOf('content');
        const prevZone = visibleZones[Math.max(zoneIdx - 1, 0)];
        setFocusZone(prevZone);
      }
    }
  }, [focusZone, focusedRow, rows.length, visibleZones]);

  useEffect(() => {
    // Content-zone row navigation must fire before the general handler
    // so we can stop propagation. Use capture phase for priority.
    window.addEventListener('keydown', handleKeyDownContent, true);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDownContent, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, handleKeyDownContent]);

  // Reset focus when tab or search changes
  useEffect(() => {
    setFocusedRow(0);
    setFocusedCol(0);
    setFocusZone('content');
  }, [tab, showSearch]);

  // Reset genre filter when tab changes
  useEffect(() => {
    setActiveGenre('All');
    setFocusedGenrePill(0);
  }, [tab]);

  // Reset type filter when tab changes away from home
  useEffect(() => {
    if (tab !== 'home') setTypeFilter('all');
  }, [tab]);

  // Keep focusedNavTab in sync with active tab
  useEffect(() => {
    setFocusedNavTab(navTabs.indexOf(tab));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Keep focusedGenrePill in sync with activeGenre
  useEffect(() => {
    const idx = ['All', ...availableGenres].indexOf(activeGenre);
    setFocusedGenrePill(idx >= 0 ? idx : 0);
  }, [activeGenre, availableGenres]);

  // Keep focusedTypePill in sync with typeFilter
  useEffect(() => {
    const types: TypeFilter[] = ['all', 'movie', 'series'];
    setFocusedTypePill(types.indexOf(typeFilter));
  }, [typeFilter]);

  const handlePlay = (item: MediaItem) => {
    navigate(`/player/${item.id}?from=tv`);
  };

  const handleSearchToggle = () => {
    setShowSearch(s => !s);
    setSearch('');
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <title>HomeStream TV</title>

      {/* TV Profile Picker — shown on first load (no profile) or on demand */}
      <TvProfilePicker
        visible={showProfilePicker}
        onSelect={handleProfileSelect}
      />

      {/* HTTPS warning — Samsung browser auto-upgrades http→https which breaks WS */}
      {typeof window !== 'undefined' && window.location.protocol === 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black text-center py-3 px-4 text-sm font-semibold">
          ⚠️ You're on HTTPS — use <strong>http://</strong>{window.location.hostname}:{window.location.port || '3000'}/tv for full TV features
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-12 pt-8 pb-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Play className="w-5 h-5 text-primary-foreground fill-primary-foreground ml-0.5" />
          </div>
          <span className="text-2xl font-bold tracking-tight">HomeStream</span>
        </div>

        {/* Search + controls */}
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search movies & shows…"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/40"
                  autoComplete="off"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={handleSearchToggle}
            className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors focus:outline-none focus:ring-4 focus:ring-white/40"
            title={showSearch ? 'Close search' : 'Search'}
          >
            {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>

          {/* Profile switcher button */}
          <button
            onClick={() => setShowProfilePicker(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-white/40"
            title="Switch profile"
          >
            {activeProfile ? (
              <>
                <span className="text-base leading-none">{activeProfile.avatar}</span>
                <span className="max-w-[80px] truncate">{activeProfile.name}</span>
              </>
            ) : (
              <>
                <User className="w-4 h-4" />
                Profile
              </>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-white/40"
          >
            <List className="w-4 h-4" />
            Desktop View
          </button>

          {/* Phone remote QR button */}
          <button
            onClick={openQr}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors focus:outline-none focus:ring-4 focus:ring-white/40 ${
              showQr ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/20'
            }`}
            title="Phone Remote"
          >
            <QrCode className="w-4 h-4" />
            Phone Remote
          </button>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      {!showSearch && (
        <TvNav
          active={tab}
          onChange={t => { setTab(t); }}
          focusedTab={focusZone === 'nav' ? focusedNavTab : -1}
        />
      )}

      {/* ── Type filter (home tab only) ── */}
      {showTypeFilter && (
        <TvTypeFilter
          active={typeFilter}
          onChange={setTypeFilter}
          focusedPill={focusZone === 'type' ? focusedTypePill : -1}
        />
      )}

      {/* ── Genre filter row ── */}
      {!showSearch && (
        <TvGenreFilter
          genres={availableGenres}
          active={activeGenre}
          onChange={setActiveGenre}
          focusedPill={focusZone === 'genre' ? focusedGenrePill : -1}
        />
      )}

      {/* ── Hero (home tab only, no search, no genre/type filter active) ── */}
      {tab === 'home' && !showSearch && activeGenre === 'All' && typeFilter === 'all' && heroItem && (
        <TvHero item={heroItem} onPlay={handlePlay} />
      )}

      {/* ── Content rows ── */}
      <div className="pb-16">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            {showSearch ? (
              <>
                <Search className="w-16 h-16 text-white/20" />
                <p className="text-white/40 text-lg">
                  {search ? `No results for "${search}"` : 'Start typing to search…'}
                </p>
              </>
            ) : (
              <>
                <Film className="w-16 h-16 text-white/20" />
                <p className="text-white/40 text-lg">No content here yet</p>
              </>
            )}
          </div>
        ) : (
          <RowList
            rows={rows}
            focusZone={focusZone}
            focusedRow={focusedRow}
            focusedCol={focusedCol}
            profileId={profileId}
            onPlay={handlePlay}
          />
        )}
      </div>

      {/* ── D-pad hint (bottom) ── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-3">
        <span className="text-white/40 text-xs flex items-center gap-1.5">
          <kbd className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono">↑↓</kbd>
          Zones
        </span>
        <span className="text-white/40 text-xs flex items-center gap-1.5">
          <kbd className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono">←→</kbd>
          Navigate
        </span>
        <span className="text-white/40 text-xs flex items-center gap-1.5">
          <kbd className="bg-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono">OK</kbd>
          Select
        </span>
        <span className="text-white/20 text-xs">HomeStream TV</span>
      </div>

      {/* ── Phone Remote QR overlay ── */}
      <QrRemoteOverlay visible={showQr} onClose={() => setShowQr(false)} />
    </div>
  );
}
