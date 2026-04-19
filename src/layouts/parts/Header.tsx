import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Upload, Menu, X, Film, Bookmark, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';
import { useProfile, PROFILES } from '@/context/ProfileContext';
import SettingsPanel from '@/components/SettingsPanel';
import StremioPanel from '@/components/StremioPanel';

interface HeaderProps {
  onChatOpen?: () => void;
}

/** Poll /api/stremio/downloads every 5s to get active download count for the badge */
function useActiveDownloadCount(): number {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/stremio/downloads');
        if (!res.ok) return;
        const data = await res.json() as {
          jobs?: { status: string }[];
          qbitTorrents?: { status: string }[];
        };
        const active =
          (data.jobs ?? []).filter(j => j.status === 'downloading' || j.status === 'queued' || j.status === 'transcoding').length +
          (data.qbitTorrents ?? []).filter(t => t.status === 'downloading' || t.status === 'queued').length;
        setCount(active);
      } catch { /* ignore */ }
    };

    poll();
    timerRef.current = setInterval(poll, 5_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return count;
}

export default function Header({ onChatOpen: _onChatOpen }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { watchlist } = useMedia();
  const { activeProfile, setActiveProfile } = useProfile();
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
  ];

  return (
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

            {/* ── Settings cog ── */}
            <SettingsPanel />

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
                      {PROFILES.map(profile => (
                        <button
                          key={profile.id}
                          onClick={() => {
                            setActiveProfile(profile.id);
                            setProfileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/10 transition-colors text-left ${
                            activeProfile.id === profile.id ? 'bg-accent/10' : ''
                          }`}
                        >
                          <span className="text-xl">{profile.avatar}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{profile.name}</p>
                            {profile.restricted && (
                              <p className="text-[10px] text-yellow-500">G &amp; PG only</p>
                            )}
                          </div>
                          {activeProfile.id === profile.id && (
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

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="md:hidden bg-background/95 backdrop-blur-sm border-t border-border"
          >
            <nav className="px-4 py-3 flex flex-col gap-3">
              {navLinks.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium py-1 ${
                    location.pathname === link.to ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/library"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 text-sm font-medium text-primary"
              >
                <Upload className="w-4 h-4" />
                Upload Media
              </Link>
              <Link
                to="/watchlist"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
              >
                <Bookmark className="w-4 h-4" />
                Watchlist {watchlist.length > 0 && `(${watchlist.length})`}
              </Link>
              {/* Mobile profile switcher */}
              <div className="border-t border-border pt-3 flex flex-col gap-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Profile</p>
                {PROFILES.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setActiveProfile(profile.id);
                      setMobileOpen(false);
                    }}
                    className={`flex items-center gap-2.5 py-1 text-left ${activeProfile?.id === profile.id ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    <span>{profile.avatar}</span>
                    <span className="text-sm font-medium">{profile.name}</span>
                    {profile.restricted && <span className="text-[10px] text-yellow-500 ml-1">G &amp; PG only</span>}
                    {activeProfile?.id === profile.id && <div className="w-1.5 h-1.5 rounded-full bg-primary ml-auto" />}
                  </button>
                ))}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
