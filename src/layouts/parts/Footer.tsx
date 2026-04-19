import { Film } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-background border-t border-border mt-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            <span className="text-xl font-heading text-foreground tracking-wider">
              HOME<span className="text-primary">STREAM</span>
            </span>
          </Link>
          <p className="text-sm text-muted-foreground">Your personal cinema, at home.</p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} HomeStream. For personal use only.</p>
        </div>
      </div>
    </footer>
  );
}
