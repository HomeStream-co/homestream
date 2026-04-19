import { Film, Github, Heart, Library, Tv2, BookMarked, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/browse', label: 'Browse', icon: Tv2 },
  { to: '/library', label: 'My Library', icon: Library },
  { to: '/watchlist', label: 'Watchlist', icon: BookMarked },
];

export default function Footer() {
  return (
    <footer className="bg-card border-t border-border mt-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main footer row */}
        <div className="py-10 grid grid-cols-1 sm:grid-cols-3 gap-8 items-start">

          {/* Brand */}
          <div className="flex flex-col gap-3">
            <Link to="/" className="flex items-center gap-2 w-fit">
              <Film className="w-5 h-5 text-primary" />
              <span className="text-xl font-heading text-foreground tracking-wider">
                HOME<span className="text-primary">STREAM</span>
              </span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
              Your personal cinema. Stream your own media collection from anywhere on your home network.
            </p>
          </div>

          {/* Navigation */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Navigate</p>
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            ))}
          </div>

          {/* Info */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">About</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Self-hosted media server with smart transcoding, AI enrichment, and parental controls.
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[11px] text-muted-foreground">For personal use only</span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} HomeStream. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-primary fill-primary" /> for home cinema lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
