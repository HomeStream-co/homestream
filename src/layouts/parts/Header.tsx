import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Upload, Menu, X, Film, Bookmark, ChevronDown, Lock,
  Home, Compass, Download, Library, History, Settings2, Wifi, BarChart3, Tv2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useProfile, type Profile } from '@/context/ProfileContext';
import SettingsPanel from '@/components/SettingsPanel';
import StremioPanel from '@/components/StremioPanel';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import SecurityPanel from '@/components/SecurityPanel';
import PinLock from '@/components/PinLock';
import NotificationBell from '@/components/NotificationBell';
import { notify } from '@/lib/notificationStore';
import { useDownloadSocket } from '@/hooks/useDownloadSocket';

const DebugPanel = lazy(() => import('@/components/DebugPanel'));

interface HeaderProps {
  onChatOpen?: () => void;
}

interface DownloadEntry {
  hash: string;
  title?: string;
  name?: string;
  status: string;
}

/** Wraps useDownloadSocket — fires toast/bell notifications on status transitions */
function useActiveDownloadCount(): number {
  const { jobs, qbitTorrents, rdJobs } = useDownloadSocket();
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const { refreshLibrary } = useMedia();

  // Unified entry list — qBit/WT use `hash` as key; RD uses `jobId`.
  // We normalise to a single `key` field so the notification tracker works
  // correctly for all three backends.
  const allEntries: (DownloadEntry & { key: string })[] = [
    ...(jobs ?? []).map(e => ({ ...e, key: e.hash })),
    ...(qbitTorrents ?? []).map(e => ({ ...e, key: e.hash })),
    ...(rdJobs ?? []).map(e => ({
      hash: e.jobId,   // satisfy DownloadEntry shape
      status: e.status,
      title: e.title,
      progress: e.progress,
      key: e.jobId,
    })),
  ];

  // Fire notifications on status transitions
  useEffect(() => {
    for (const entry of allEntries) {
      const prev = prevStatuses.current.get(entry.key);
      const isNowDone = entry.status === 'done' || entry.status === 'seeding';
      const isNowError = entry.status === 'error';
      const wasActive = prev === 'downloading' || prev === 'queued';

      if (wasActive && isNowDone) {
        const label = entry.title || entry.name || 'Download';
        notify({ type: 'download_complete', title: label, message: 'Download complete — ready to watch', ttl: 0 });
        toast.success(`"${label}" is ready to watch`, {
          description: 'Added to your library',
          duration: 5000,
          action: { label: 'Go to Library', onClick: () => window.location.assign('/library') },
        });
        refreshLibrary?.();
      }

      if (wasActive && isNowError) {
        const label = entry.title || entry.name || 'Download';
        notify({ type: 'download_error', title: label, message: 'Download failed — check the Downloads page', ttl: 0 });
      }
    }

    const next = new Map<string, string>();
    for (const e of allEntries) next.set(e.key, e.status);
    prevStatuses.current = next;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, qbitTorrents, rdJobs]);

  return allEntries.filter(
    e => e.status === 'downloading' || e.status === 'queued' || e.status === 'transcoding'
  ).length;
}

export default function Header({ onChatOpen: _onChatOpen }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [settingsForceOpen, setSettingsForceOpen] = useState(false);
  const [pinPendingProfile, setPinPendingProfile] = useState<Profile | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { watchlist } = useMedia();
  const { activeProfile, profiles, setActiveProfile, verifyPin } = useProfile();
  const activeDownloads = useActiveDownloadCount();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = () => setProfileMenuOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [profileMenuOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const navLinks = [
    { to: '/',          label: 'Home' },
    { to: '/discover',  label: 'Discover' },
    { to: '/downloads', label: 'Downloads' },
    { to: '/library',   label: 'My Library' },
    { to: '/history',   label: 'History' },
    { to: '/stats',     label: 'Stats' },
    { to: '/samsung-tv', label: 'Watch on TV', icon: Tv2 },
  ];

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'glass shadow-lg shadow-black/40'
            : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent'
        }`}
      >
        <div className="w-full px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between h-16">

            {/* ── Logo ── */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="relative">
                <Film className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute inset-0 bg-primary/30 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              <span className="text-xl font-heading tracking-widest text-foreground">
                HOME<span className="text-primary">STREAM</span>
              </span>
            </Link>

            {/* ── Desktop Nav ── */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                    link.to === '/samsung-tv'
                      ? isActive(link.to)
                        ? 'text-primary bg-primary/15 border border-primary/30'
                        : 'text-primary/80 hover:text-primary hover:bg-primary/10 border border-primary/20'
                      : isActive(link.to)
                        ? 'text-foreground bg-white/8'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  {link.icon && <link.icon className="w-3.5 h-3.5" />}
                  {link.label}
                  {isActive(link.to) && link.to !== '/samsung-tv' && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  {link.to === '/downloads' && activeDownloads > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 animate-pulse">
                      {activeDownloads > 9 ? '9+' : activeDownloads}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            {/* ── Right Actions ── */}
            <div className="flex items-center gap-1">

              {/* Search */}
              <AnimatePresence mode="wait">
                {searchOpen ? (
                  <motion.form
                    key="search-form"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 240, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' as const }}
                    onSubmit={handleSearch}
                    className="overflow-hidden flex-shrink-0"
                  >
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search titles, actors..."
                        className="w-full glass rounded-xl pl-9 pr-8 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                        onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </motion.form>
                ) : (
                  <motion.button
                    key="search-btn"
                    onClick={() => setSearchOpen(true)}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all duration-200"
                    title="Search"
                    whileTap={{ scale: 0.92 }}
                  >
                    <Search className="w-4.5 h-4.5" />
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Upload */}
              <Link
                to="/library"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/80 text-primary-foreground text-sm font-semibold rounded-lg transition-all duration-200 hover:shadow-md hover:shadow-primary/25"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </Link>

              {/* Watchlist */}
              <Link
                to="/watchlist"
                className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all duration-200"
                title="My Watchlist"
              >
                <Bookmark className={`w-4.5 h-4.5 transition-colors ${location.pathname === '/watchlist' ? 'text-primary fill-primary' : ''}`} />
                {watchlist.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-primary text-primary-foreground text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {watchlist.length > 99 ? '99+' : watchlist.length}
                  </span>
                )}
              </Link>

              {/* Notification Bell */}
              <NotificationBell />

              {/* Settings */}
              <SettingsPanel
                onOpenSecurity={() => setSecurityOpen(true)}
                onOpenDebug={() => setDebugOpen(true)}
                forceOpen={settingsForceOpen}
                onClose={() => setSettingsForceOpen(false)}
              />

              <Suspense fallback={null}>
                <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
              </Suspense>
              <SecurityPanel
                open={securityOpen}
                onClose={() => setSecurityOpen(false)}
                onBack={() => { setSecurityOpen(false); setSettingsForceOpen(true); }}
              />

              {/* Stremio */}
              <InlineErrorBoundary label="StremioPanel">
                <StremioPanel />
              </InlineErrorBoundary>

              {/* ── Profile Switcher ── */}
              {activeProfile && (
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setProfileMenuOpen(prev => !prev)}
                    className={`flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl border transition-all duration-200 ${
                      activeProfile.restricted
                        ? 'border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/15'
                        : 'border-border/60 bg-white/5 hover:bg-white/10'
                    }`}
                    title="Switch profile"
                  >
                    {/* Avatar circle */}
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-base leading-none ${
                      activeProfile.restricted ? 'bg-yellow-500/20' : 'bg-primary/20'
                    }`}>
                      {activeProfile.avatar}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block max-w-[80px] truncate ${
                      activeProfile.restricted ? 'text-yellow-400' : 'text-foreground'
                    }`}>
                      {activeProfile.name}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''} ${
                      activeProfile.restricted ? 'text-yellow-400' : 'text-muted-foreground'
                    }`} />
                  </button>

                  {/* Dropdown */}
                  <AnimatePresence>
                    {profileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -6 }}
                        transition={{ duration: 0.15, ease: 'easeOut' as const }}
                        className="absolute right-0 top-full mt-2 w-52 glass rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
                      >
                        <div className="px-3 py-2.5 border-b border-border/50">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Switch Profile</p>
                        </div>
                        <div className="py-1">
                          {profiles.map(profile => (
                            <button
                              key={profile.id}
                              onClick={() => {
                                if (profile.hasPin && activeProfile?.id !== profile.id) {
                                  setPinPendingProfile(profile);
                                  setProfileMenuOpen(false);
                                  return;
                                }
                                setActiveProfile(profile.id);
                                setProfileMenuOpen(false);
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/8 transition-colors text-left ${
                                activeProfile?.id === profile.id ? 'bg-primary/10' : ''
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg leading-none flex-shrink-0 ${
                                activeProfile?.id === profile.id ? 'bg-primary/20' : 'bg-muted'
                              }`}>
                                {profile.avatar}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{profile.name}</p>
                                {profile.restricted && (
                                  <p className="text-[10px] text-yellow-500">G &amp; PG only</p>
                                )}
                                {profile.hasPin && (
                                  <p className="text-[10px] text-primary/70 flex items-center gap-0.5">
                                    <Lock className="w-2.5 h-2.5" /> PIN protected
                                  </p>
                                )}
                              </div>
                              {activeProfile?.id === profile.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-border/50 py-1">
                          <button
                            onClick={() => { setProfileMenuOpen(false); navigate('/profiles'); }}
                            className="w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors text-left flex items-center gap-2"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                            Manage profiles
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Mobile Menu Toggle */}
              <button
                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                <AnimatePresence mode="wait">
                  {mobileOpen
                    ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X className="w-5 h-5" /></motion.div>
                    : <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Menu className="w-5 h-5" /></motion.div>
                  }
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>

        {/* ── Mobile Menu Drawer ── */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' as const }}
              className="md:hidden overflow-hidden glass border-t border-border/50"
            >
              <div className="px-4 py-4 flex flex-col gap-1">
                {[
                  { to: '/',          label: 'Home',         Icon: Home },
                  { to: '/discover',  label: 'Discover',     Icon: Compass },
                  { to: '/downloads', label: 'Downloads',    Icon: Download, badge: activeDownloads },
                  { to: '/library',   label: 'My Library',   Icon: Library },
                  { to: '/history',   label: 'History',      Icon: History },
                  { to: '/watchlist', label: 'Watchlist',    Icon: Bookmark, badge: watchlist.length },
                  { to: '/remote',    label: 'Phone Remote', Icon: Wifi },
                  { to: '/stats',     label: 'Stats',        Icon: BarChart3 },
                ].map(({ to, label, Icon, badge }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
                      location.pathname === to
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">{label}</span>
                    {badge != null && badge > 0 && (
                      <span className="min-w-[20px] h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                ))}

                <div className="border-t border-border/50 my-2" />

                <Link
                  to="/library"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-all"
                >
                  <Upload className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-semibold">Upload Media</span>
                </Link>

                <div className="border-t border-border/50 my-2" />

                <div className="px-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold px-2 mb-2">Profile</p>
                  <div className="flex flex-col gap-0.5">
                    {profiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => {
                          if (profile.hasPin && activeProfile?.id !== profile.id) {
                            setPinPendingProfile(profile);
                            setMobileOpen(false);
                            return;
                          }
                          setActiveProfile(profile.id);
                          setMobileOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                          activeProfile?.id === profile.id
                            ? 'bg-primary/15 text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/8'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-lg leading-none flex-shrink-0">
                          {profile.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">{profile.name}</span>
                          {profile.restricted && <span className="text-[10px] text-yellow-500">G &amp; PG only</span>}
                          {profile.hasPin && (
                            <span className="text-[10px] text-primary/70 flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> PIN protected
                            </span>
                          )}
                        </div>
                        {activeProfile?.id === profile.id && (
                          <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setMobileOpen(false); navigate('/profiles'); }}
                    className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Manage profiles
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* PIN lock overlay */}
      {pinPendingProfile && (
        <PinLock
          profileName={pinPendingProfile.name}
          onVerify={pin => verifyPin(pinPendingProfile.id, pin)}
          onSuccess={() => {
            setActiveProfile(pinPendingProfile.id);
            setPinPendingProfile(null);
            toast.success(`Welcome, ${pinPendingProfile.name}`);
          }}
          onCancel={() => setPinPendingProfile(null)}
        />
      )}
    </>
  );
}
