/**
 * demoItem — backwards-compat re-export.
 * The full demo library now lives in demoLibrary.ts.
 * This file keeps existing imports working.
 */
export { DEMO_MOVIES as DEMO_ITEMS, ALL_DEMO_ITEMS } from './demoLibrary.js';

// Legacy single-item export used by a few older imports
import { DEMO_MOVIES } from './demoLibrary.js';
export const DEMO_ITEM = DEMO_MOVIES[0]; // Big Buck Bunny
