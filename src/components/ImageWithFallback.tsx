/**
 * ImageWithFallback
 * Renders an <img> and swaps to a grey placeholder on error.
 */
import { useState } from 'react';
import { Film } from 'lucide-react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  fallbackClassName?: string;
}

export default function ImageWithFallback({
  src, alt = '', className, fallbackClassName, ...rest
}: ImageWithFallbackProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className={`flex items-center justify-center bg-muted ${fallbackClassName ?? className ?? ''}`}>
        <Film className="w-6 h-6 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
      {...rest}
    />
  );
}
