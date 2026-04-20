// require-shim.js — injected by esbuild at the top of server.bundle.mjs
// Provides a CJS-compatible `require` for any bundled deps that call require().
// Using a unique name avoids conflicts with bundled deps that also import createRequire.
import { createRequire as __airo_createRequire } from 'module';
globalThis.require = globalThis.require || __airo_createRequire(import.meta.url);
