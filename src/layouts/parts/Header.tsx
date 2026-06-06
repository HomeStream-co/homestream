import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Search, Upload, Menu, X, Film, Bookmark,
  Home, Compass, Download, Library, History, Wifi, BarChart3, Tv2, Settings2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    { to: '/',           label: 'Home' },
    { to: '/discover',   label: 'Discover' },
    { to: '/downloads',  label: 'Downloads' },
    { to: '/library',    label: 'My Library' },
    { to: '/history',    label: 'History' },
    { to: '/stats',      label: 'Stats' },
    { to: '/samsung-tv', label: 'Watch on TV', icon: Tv2 },
  ];

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass shadow-lg shadow-black/40'
          : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div className="relative">
              <Film className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute inset-0 bg-primary/30 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="text-xl font-heading tracking-widest text-foreground">
              HOME<span className="text-primary">STREAM</span>
            </span>
          </Link>

          {/* Desktop Nav */}
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
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
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
                  <Search className="w-4 h-4" />
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
              <Bookmark className={`w-4 h-4 transition-colors ${location.pathname === '/watchlist' ? 'text-primary fill-primary' : ''}`} />
            </Link>

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

      {/* Mobile Menu Drawer */}
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
                { to: '/downloads', label: 'Downloads',    Icon: Download },
                { to: '/library',   label: 'My Library',   Icon: Library },
                { to: '/history',   label: 'History',      Icon: History },
                { to: '/watchlist', label: 'Watchlist',    Icon: Bookmark },
                { to: '/remote',    label: 'Phone Remote', Icon: Wifi },
                { to: '/stats',     label: 'Stats',        Icon: BarChart3 },
              ].map(({ to, label, Icon }) => (
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

              <Link
                to="/profiles"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Manage profiles
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
