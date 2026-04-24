/**
 * Vitest setup file for Node.js environment tests (server-side handlers).
 * No DOM globals needed here — just vitest utilities.
 */
import { vi } from 'vitest';

// Silence console.error in tests unless explicitly needed
// (handlers log errors to console; we don't want noise in test output)
vi.spyOn(console, 'error').mockImplementation(() => {});
