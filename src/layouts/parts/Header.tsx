import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Upload, Menu, X, Film, Bookmark, ChevronDown, Lock,
  Home, Compass, Download, Library, History, Settings2, Wifi, BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useMedia } from '@/context/MediaContext';
import { useProfile, type Profile } from '@/context/ProfileContext';
import SettingsPanel from '@/components/SettingsPanel';
import StremioPanel from '@/components/StremioPanel';
import SecurityPanel from '@/components/SecurityPanel';
import PinLock from '@/components/PinLock';
import NotificationBell from '@/components/NotificationBell';
import { notify } from '@/lib/notificationStore';

// DebugPanel is dev-only — excluded from production bundle
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('@/components/DebugPanel'))
  : null;

interface HeaderProps {
  onChatOpen?: () => void;
}

interface DownloadEntry {
  hash: string;
  title?: string;
  name?: string;
  status: string;
}

/**
 * Poll /api/stremio/downloads every 5s.
 * Returns active download count and fires a toast when a torrent transitions
 * from downloading → done/seeding.
 */
function useActiveDownloadCount(): number {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track previous statuses so we can detect transitions
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const { refreshLibrary } = useMedia();

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/stremio/downloads');
        if (!res.ok) return;
        const data = await res.json() as {
          jobs?: DownloadEntry[];
          qbitTorrents?: DownloadEntry[];
        };

        const allEntries: DownloadEntry[] = [
          ...(data.jobs ?? []),
          ...(data.qbitTorrents ?? []),
        ];

        // Detect completions
        for (const entry of allEntries) {
          const prev = prevStatuses.current.get(entry.hash);
          const isNowDone = entry.status === 'done' || entry.status === 'seeding';
          const isNowError = entry.status === 'error';
          const wasActive = prev === 'downloading' || prev === 'queued';

          if (wasActive && isNowDone) {
            const label = entry.title || entry.name || 'Download';
            // Push to persistent notification store (bell icon)
            notify({
              type: 'download_complete',
              title: label,
              message: 'Download complete — ready to watch',
              ttl: 0,
            });
            // Also show a transient toast for immediate visibility
            toast.success(`"${label}" is ready to watch`, {
              description: 'Added to your library',
              duration: 5000,
              action: { label: 'Go to Library', onClick: () => window.location.assign('/library') },
            });
            refreshLibrary?.();
          }

          if (wasActive && isNowError) {
            const label = entry.title || entry.name || 'Download';
            notify({
              type: 'download_error',
              title: label,
              message: 'Download failed — check the Downloads page',
              ttl: 0,
            });
          }
        }

        // Update prev map
        const next = new Map<string, string>();
        for (const e of allEntries) next.set(e.hash, e.status);
        prevStatuses.current = next;

        const active =
          (data.jobs ?? []).filter(j => j.status === 'downloading' || j.status === 'queued' || j.status === 'transcoding').length +
          (data.qbitTorrents ?? []).filter(t => t.status === 'downloading' || t.status === 'queued').length;
        setCount(active);
      } catch { /* ignore */ }
    };

    poll();
    timerRef.current = setInterval(poll, 5_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return count;
}

export default function Header({ onChatOpen: _onChatOpen }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  // PIN lock state — which profile is pending PIN verification
  const [pinPendingProfile, setPinPendingProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { watchlist } = useMedia();
  const { activeProfile, profiles, setActiveProfile, verifyPin } = useProfile();
  const activeDownloads = useActiveDownloadCount();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileMenuOpen) return;
    const handler = () => setProfileMenuOpen(false);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [profileMenuOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // Navigate to home with ?q= so the inline search grid activates
      navigate(`/?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const navLinks = [
    { to: '/',         label: 'Home' },
    { to: '/discover', label: 'Discover' },
    { to: '/downloads', label: 'Downloads' },
    { to: '/library',  label: 'My Library' },
    { to: '/history',  label: 'History' },
    { to: '/stats',    label: 'Stats' },
  ];

  return (
    <>
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-background/95 backdrop-blur-sm shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <Film className="w-6 h-6 text-primary" />
            <span className="text-2xl font-heading text-foreground tracking-wider">
              HOME<span className="text-primary">STREAM</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`relative text-sm font-medium transition-colors hover:text-foreground ${
                  location.pathname === link.to ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {link.label}
                {link.to === '/downloads' && activeDownloads > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[16px] h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 animate-pulse">
                    {activeDownloads > 9 ? '9+' : activeDownloads}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <AnimatePresence>
              {searchOpen ? (
                <motion.form
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 200, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleSearch}
                  className="overflow-hidden"
                >
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search titles..."
                    className="w-full bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                  />
                </motion.form>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  title="Search"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}
            </AnimatePresence>

            {/* Upload */}
            <Link
              to="/library"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/80 text-white text-sm font-medium rounded transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload</span>
            </Link>

            {/* Watchlist shortcut */}
            <Link
              to="/watchlist"
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="My Watchlist"
            >
              <Bookmark className={`w-5 h-5 transition-colors ${location.pathname === '/watchlist' ? 'text-primary fill-primary' : ''}`} />
              {watchlist.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {watchlist.length > 99 ? '99+' : watchlist.length}
                </span>
              )}
            </Link>

            {/* Notification Bell */}
            <NotificationBell />

            {/* ── Settings cog (Security Center + Debug Panel live inside) ── */}
            <SettingsPanel
              onOpenSecurity={() => setSecurityOpen(true)}
              onOpenDebug={import.meta.env.DEV ? () => setDebugOpen(true) : undefined}
            />

            {import.meta.env.DEV && DebugPanel && (
              <Suspense fallback={null}>
                <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
              </Suspense>
            )}
            <SecurityPanel open={securityOpen} onClose={() => setSecurityOpen(false)} />

            {/* ── Stremio ── */}
            <StremioPanel />

            {/* ── Profile Switcher ── */}
            {activeProfile && (
              <div className="relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setProfileMenuOpen(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
                    activeProfile.restricted
                      ? 'border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20'
                      : 'border-border bg-card/60 hover:bg-card'
                  }`}
                  title="Switch profile"
                >
                  <span className="text-base leading-none">{activeProfile.avatar}</span>
                  <span className={`text-xs font-medium hidden sm:block ${activeProfile.restricted ? 'text-yellow-400' : 'text-foreground'}`}>
                    {activeProfile.name}
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${profileMenuOpen ? 'rotate-180' : ''} ${activeProfile.restricted ? 'text-yellow-400' : 'text-muted-foreground'}`} />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {profileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
                    >
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Switch Profile</p>
                      </div>
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
                          className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/10 transition-colors text-left ${
                            activeProfile?.id === profile.id ? 'bg-accent/10' : ''
                          }`}
                        >
                          <span className="text-xl">{profile.avatar}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{profile.name}</p>
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
                      <div className="border-t border-border">
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            navigate('/profiles');
                          }}
                          className="w-full px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors text-left"
                        >
                          Manage profiles
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Mobile Menu */}
            <button
              className="md:hidden p-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
            transition={{ duration: 0.2, ease: 'easeInOut' as const }}
            className="md:hidden overflow-hidden bg-background/98 backdrop-blur-md border-t border-border shadow-xl"
          >
            <div className="px-4 py-4 flex flex-col gap-1">

              {/* Nav links with icons */}
              {[
                { to: '/',          label: 'Home',       Icon: Home },
                { to: '/discover',  label: 'Discover',   Icon: Compass },
                { to: '/downloads', label: 'Downloads',  Icon: Download, badge: activeDownloads },
                { to: '/library',   label: 'My Library', Icon: Library },
                { to: '/history',   label: 'History',    Icon: History },
                { to: '/watchlist', label: 'Watchlist',  Icon: Bookmark, badge: watchlist.length },
                { to: '/remote',    label: 'Phone Remote', Icon: Wifi },
                { to: '/stats',     label: 'Stats',        Icon: BarChart3 },
              ].map(({ to, label, Icon, badge }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-colors ${
                    location.pathname === to
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {badge != null && badge > 0 && (
                    <span className="min-w-[20px] h-5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              ))}

              {/* Divider */}
              <div className="border-t border-border my-2" />

              {/* Upload shortcut */}
              <Link
                to="/library"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors"
              >
                <Upload className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-semibold">Upload Media</span>
              </Link>

              {/* Divider */}
              <div className="border-t border-border my-2" />

              {/* Profile switcher */}
              <div className="px-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-2 mb-2">Profile</p>
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                        activeProfile?.id === profile.id
                          ? 'bg-accent/10 text-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                      }`}
                    >
                      <span className="text-lg leading-none">{profile.avatar}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium block">{profile.name}</span>
                        {profile.restricted && (
                          <span className="text-[10px] text-yellow-500">G &amp; PG only</span>
                        )}
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

    {/* PIN lock overlay — shown when switching to a PIN-protected profile */}
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
