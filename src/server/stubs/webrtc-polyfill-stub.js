/**
 * Stub for the entire webrtc-polyfill package.
 *
 * webrtc-polyfill/lib/Blob.js uses top-level await (TLA):
 *   const _Blob = globalThis.Blob || (await import('node:buffer')).Blob
 *
 * esbuild cannot inline TLA into its synchronous __esm() wrappers, so the
 * async-ness propagates through every module that (transitively) imports
 * Blob.js — ultimately infecting the entire webrtc-polyfill graph and
 * producing "SyntaxError: Unexpected reserved word" at runtime.
 *
 * On Node 18+ these polyfills are unnecessary:
 *   - globalThis.Blob is built-in
 *   - WebRTC is provided by node-datachannel (webtorrent's actual dep)
 *
 * This stub replaces the whole package with synchronous no-ops so esbuild
 * can bundle webtorrent without any async module pollution.
 */

// Blob — Node 18+ always has globalThis.Blob
const _Blob = globalThis.Blob;

// Minimal class stubs — webtorrent only needs these to exist at import time;
// node-datachannel provides the real implementations at runtime.
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

// Events stubs (webrtc-polyfill/lib/Events.js exports these names)
class RTCPeerConnectionIceEvent extends Event {}
class RTCPeerConnectionIceErrorEvent extends Event {}
class RTCDataChannelEvent extends Event {}
class RTCTrackEvent extends Event {}
class RTCDTMFToneChangeEvent extends Event {}
class RTCErrorEvent extends Event {}

// RTCRtp stubs
const RTCRtpSender = class {};
const RTCRtpReceiver = class {};
const RTCRtpTransceiver = class {};

export {
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
  _Blob as Blob,
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
