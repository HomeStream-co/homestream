/**
 * ImageWithFallback — renders an <img> and swaps to a styled placeholder
 * if the image fails to load (404, CORS, no API key, etc.).
 *
 * For TMDB CDN URLs that fail (e.g. mixed-content or CORS), automatically
 * retries via the local /api/tmdb-proxy endpoint which fetches server-side.
 *
 * Usage:
 *   <ImageWithFallback src={url} alt="Title" className="w-full h-full object-cover" />
 */

import { useState, useCallback } from 'react';
import { Film, Tv } from 'lucide-react';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  /** Icon to show in fallback — 'film' (default) or 'tv' */
  fallbackIcon?: 'film' | 'tv';
  /** Extra classes applied to the fallback container (same size as img) */
  fallbackClassName?: string;
}

const TMDB_CDN = 'image.tmdb.org';

export default function ImageWithFallback({
  src,
  alt,
  fallbackIcon = 'film',
  fallbackClassName,
  className,
  ...rest
}: Props) {
  const [error, setError] = useState(false);
  const [proxied, setProxied] = useState(false);
  const Icon = fallbackIcon === 'tv' ? Tv : Film;

  // Build the proxy URL for TMDB CDN images
  const proxyUrl = src && src.includes(TMDB_CDN)
    ? `/api/tmdb-proxy?url=${encodeURIComponent(src)}`
    : null;

  const handleError = useCallback(() => {
    // If we haven't tried the proxy yet and this is a TMDB CDN URL, try it
    if (!proxied && proxyUrl) {
      setProxied(true);
    } else {
      setError(true);
    }
  }, [proxied, proxyUrl]);

  if (!src || error) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-card text-muted-foreground/30 ${fallbackClassName ?? className ?? ''}`}
        aria-label={alt}
      >
        <Icon className="w-8 h-8" />
        <span className="text-[10px] text-center px-2 line-clamp-2 text-muted-foreground/50">{alt}</span>
      </div>
    );
  }

  const activeSrc = proxied && proxyUrl ? proxyUrl : src;

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      onError={handleError}
      {...rest}
    />
  );
}
