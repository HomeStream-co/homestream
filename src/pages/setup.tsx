import { Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * /setup — HomeStream setup wizard (coming soon).
 * This page will walk new users through:
 *  1. Media directory configuration
 *  2. API key entry (OMDB, Gemini)
 *  3. Transcode quality preferences
 *  4. Docker / network setup guidance
 */
export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <title>Setup — HomeStream</title>
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
          <Wrench className="w-9 h-9 text-primary" />
        </div>
        <h1 className="text-4xl font-heading text-foreground mb-3">Setup Wizard</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          The guided setup wizard is coming soon. It will walk you through configuring your media directory,
          API keys, transcode settings, and Docker deployment in one place.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/80 text-primary-foreground px-6 py-2.5 rounded font-medium text-sm transition-colors"
        >
          Back to HomeStream
        </Link>
      </div>
    </div>
  );
}
