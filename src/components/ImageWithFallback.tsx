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

// Domains that can be proxied server-side to avoid CORS / mixed-content issues.
// Cinemeta returns both image.tmdb.org and images.metahub.space poster URLs.
const PROXYABLE_DOMAINS = ['image.tmdb.org', 'images.metahub.space'];

function isProxyable(url: string): boolean {
  return PROXYABLE_DOMAINS.some(d => url.includes(d));
}

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

  // Build the proxy URL for known CDN images that may fail due to CORS/mixed-content
  const proxyUrl = src && isProxyable(src)
    ? `/api/tmdb-proxy?url=${encodeURIComponent(src)}`
    : null;

  const handleError = useCallback(() => {
    // If we haven't tried the proxy yet and this is a proxiable URL, try it
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
