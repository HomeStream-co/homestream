/**
 * ImageWithFallback — renders an <img> and swaps to a styled placeholder
 * if the image fails to load (404, CORS, no API key, etc.).
 *
 * Usage:
 *   <ImageWithFallback src={url} alt="Title" className="w-full h-full object-cover" />
 */

import { useState } from 'react';
import { Film, Tv } from 'lucide-react';

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt: string;
  /** Icon to show in fallback — 'film' (default) or 'tv' */
  fallbackIcon?: 'film' | 'tv';
  /** Extra classes applied to the fallback container (same size as img) */
  fallbackClassName?: string;
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
  const Icon = fallbackIcon === 'tv' ? Tv : Film;

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

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      {...rest}
    />
  );
}
