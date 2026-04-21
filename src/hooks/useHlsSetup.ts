/**
 * useHlsSetup — HLS probe + attach for HEVC/H.265 and other non-native codecs.
 *
 * On mount (or when `id` changes):
 *   1. Calls GET /api/hls/:id/probe to check if the file needs HLS transcoding
 *   2. If yes, lazily imports hls.js and attaches it to the video element
 *   3. Exposes hlsUrl and hlsCodec for the badge in the player UI
 *
 * On unmount: destroys the HLS instance and clears the video src.
 */

import { useState, useRef, useEffect } from 'react';

export function useHlsSetup(
  id: string | undefined,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) {
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [hlsCodec, setHlsCodec] = useState<string | null>(null);
  const hlsInstanceRef = useRef<import('hls.js').default | null>(null);

  useEffect(() => {
    if (!id) return;
    setHlsUrl(null);
    setHlsCodec(null);

    let cancelled = false;

    fetch(`/api/hls/${id}/probe`)
      .then(r => r.json())
      .then(async (data: { needsTranscode?: boolean; needsHls?: boolean; codec?: string; hlsUrl?: string }) => {
        // API returns `needsTranscode`; `needsHls` kept as fallback for older responses
        const shouldUseHls = data.needsTranscode ?? data.needsHls;
        if (cancelled || !shouldUseHls || !data.hlsUrl) return;

        const url = data.hlsUrl;
        const codec = data.codec ?? 'hevc';

        setHlsUrl(url);
        setHlsCodec(codec);

        const Hls = (await import('hls.js')).default;
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true });
          hlsInstanceRef.current = hls;
          const video = videoRef.current;
          if (video) {
            hls.loadSource(url);
            hls.attachMedia(video);
          }
        } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari native HLS
          videoRef.current.src = url;
        }
      })
      .catch(() => { /* non-fatal — fall back to direct stream */ });

    return () => {
      cancelled = true;
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return { hlsUrl, hlsCodec, hlsInstanceRef };
}
