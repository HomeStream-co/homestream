import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalise actors field — handles both string[] (demo) and comma-string (OMDB). */
export function toActorsArray(actors: string | string[] | undefined): string[] {
  if (!actors) return [];
  if (Array.isArray(actors)) return actors.filter(Boolean);
  return actors.split(',').map(a => a.trim()).filter(Boolean);
}

/** Return actors as a display string regardless of storage format. */
export function toActorsString(actors: string | string[] | undefined): string {
  if (!actors) return 'Unknown';
  if (Array.isArray(actors)) return actors.join(', ') || 'Unknown';
  return actors || 'Unknown';
}
