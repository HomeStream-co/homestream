/**
 * TrailerHover — wraps a MediaCard and shows a trailer preview on long hover.
 * Currently a passthrough stub; full implementation fetches a YouTube embed
 * after a 1.5s hover delay.
 */
import type { ReactNode } from 'react';
import type { MediaItem } from '@/types/media';

interface TrailerHoverProps {
  item: MediaItem;
  children: ReactNode;
}

export default function TrailerHover({ children }: TrailerHoverProps) {
  // Passthrough — trailer preview will be implemented in a future phase
  return <>{children}</>;
}
