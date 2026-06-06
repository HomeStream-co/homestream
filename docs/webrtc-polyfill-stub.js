/**
 * Synchronous stub for the entire webrtc-polyfill package.
 *
 * WHY THIS EXISTS:
 *   webrtc-polyfill/lib/Blob.js contains a top-level await (TLA):
 *     const _Blob = globalThis.Blob || (await import('node:buffer')).Blob
 *
 *   esbuild cannot inline TLA into its synchronous __esm() wrappers.
 *   The async-ness propagates through every module that transitively imports
 *   Blob.js (RTCDataChannel → Blob → whole package), ultimately producing:
 *     "SyntaxError: Unexpected reserved word" at runtime.
 *
 * WHY IT'S SAFE:
 *   On Node 18+ globalThis.Blob is always available — the polyfill is a no-op.
 *   Real WebRTC functionality is provided by node-datachannel at runtime.
 *   webtorrent only needs these symbols to exist at import time.
 *
 * SCOPE: This stub is used only by the esbuild server bundle (Electron / Docker).
 *        The browser client never imports webrtc-polyfill.
 */

// Blob — Node 18+ always has globalThis.Blob
const _Blob = globalThis.Blob;

// Minimal class stubs — real implementations come from node-datachannel at runtime
class RTCPeerConnection {}
class RTCSessionDescription {}
class RTCIceCandidate {}
class RTCIceTransport {}
class RTCDataChannel {}
class RTCSctpTransport {}
class RTCDtlsTransport {}
class RTCCertificate {}
class MediaStream {}
class RTCError extends Error {}

// Events (webrtc-polyfill/lib/Events.js named exports)
class RTCPeerConnectionIceEvent extends Event {}
class RTCPeerConnectionIceErrorEvent extends Event {}
class RTCDataChannelEvent extends Event {}
class RTCTrackEvent extends Event {}
class RTCDTMFToneChangeEvent extends Event {}
class RTCErrorEvent extends Event {}

// RTCRtp (webrtc-polyfill/lib/RTCRtp.js named exports)
class RTCRtpSender {}
class RTCRtpReceiver {}
class RTCRtpTransceiver {}

export {
  _Blob as Blob,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCIceTransport,
  RTCDataChannel,
  RTCSctpTransport,
  RTCDtlsTransport,
  RTCCertificate,
  MediaStream,
  RTCError,
  RTCPeerConnectionIceEvent,
  RTCPeerConnectionIceErrorEvent,
  RTCDataChannelEvent,
  RTCTrackEvent,
  RTCDTMFToneChangeEvent,
  RTCErrorEvent,
  RTCRtpSender,
  RTCRtpReceiver,
  RTCRtpTransceiver,
};

export default {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  RTCIceTransport,
  RTCDataChannel,
  RTCSctpTransport,
  RTCDtlsTransport,
  RTCCertificate,
  MediaStream,
  RTCError,
  RTCPeerConnectionIceEvent,
  RTCPeerConnectionIceErrorEvent,
  RTCDataChannelEvent,
  RTCTrackEvent,
  RTCDTMFToneChangeEvent,
  RTCErrorEvent,
  RTCRtpSender,
  RTCRtpReceiver,
  RTCRtpTransceiver,
};
