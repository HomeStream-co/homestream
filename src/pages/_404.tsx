import { Link } from '../router';
import { Home, ArrowLeft, Film } from 'lucide-react';

/**
 * 404 Not Found page — HomeStream themed.
 * Uses semantic CSS variables so it respects the active color scheme.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="container mx-auto px-4 max-w-lg text-center space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
            <Film className="w-12 h-12 text-muted-foreground" />
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-3">
          <p className="text-8xl font-black text-primary tracking-tight">404</p>
          <h1 className="text-2xl font-bold text-foreground">Page Not Found</h1>
          <p className="text-muted-foreground">
            This scene got cut from the final edit. The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 flex-wrap">
          <Link to="/">
            <button className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity">
              <Home className="w-4 h-4" />
              Go Home
            </button>
          </Link>
          <button
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-muted text-foreground font-semibold rounded-lg hover:bg-muted/80 transition-colors"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
