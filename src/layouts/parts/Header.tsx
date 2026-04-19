import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Upload, Menu, X, Film, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useMedia } from '@/context/MediaContext';

interface HeaderProps {
  onChatOpen?: () => void;
}

export default function Header({ onChatOpen: _onChatOpen }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { watchlist } = useMedia();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/browse', label: 'Browse' },
    { to: '/shows', label: 'TV Shows' },
    { to: '/watchlist', label: 'Watchlist' },
    { to: '/library', label: 'My Library' },
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
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  location.pathname === link.to ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {link.label}
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
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
