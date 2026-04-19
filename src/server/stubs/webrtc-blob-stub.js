/**
 * Stub for webrtc-polyfill/lib/Blob.js
 *
 * The original uses top-level await:
 *   const _Blob = globalThis.Blob || (await import('node:buffer')).Blob
 *
 * esbuild cannot inline top-level await into its __esm() wrappers, causing
 * "SyntaxError: Unexpected reserved word" at runtime.
 *
 * On Node 18+ globalThis.Blob is always defined, so the polyfill is a no-op.
 * This stub replaces the TLA with a synchronous equivalent that esbuild can bundle.
 */

// Node 18+ always has globalThis.Blob; fall back to node:buffer synchronously.
const _Blob = globalThis.Blob ?? require('node:buffer').Blob;

export default _Blob;
