// This file intentionally throws an error so that the `ws` library
// gracefully falls back to its JS implementation instead of crashing
// when trying to load incompatible native .node files in Electron.
throw new Error("Native module intentionally disabled for Electron compatibility");
