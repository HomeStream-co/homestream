import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  X, Download, Search, AlertCircle, Loader2,
  HardDrive, ListVideo, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import ImageWithFallback from '@/components/ImageWithFallback';

export interface DownloadTarget {
  id?: number;
  title: string;
  posterUrl?: string;
  release_date?: string;
  imdbId?: string;
  type: 'movie' | 'series';
}

interface StreamResult {
  name: string;
  title: string;
  url: string;
  imdbId: string;
  quality: string;
  size: string;
  seeds: string;
  magnet: string;
  source: string;
}

interface StremioDownloadModalProps {
  target: DownloadTarget;
  onClose: () => void;
}

function formatDate(d: string) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d;
  }
}

export default function StremioDownloadModal({ target, onClose }: StremioDownloadModalProps) {
  const [subMode, setSubMode] = useState<'episode' | 'bulk'>('episode');
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [searching, setSearching] = useState(false);
  const [streams, setStreams] = useState<StreamResult[]>([]);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  // Bulk downloads states
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [episodesPerSeason, setEpisodesPerSeason] = useState(12);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  // Show metadata states
  const [seasonsData, setSeasonsData] = useState<any[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(false);

  // Fetch show metadata if it's a TV series to get season/episode counts
  useEffect(() => {
    if (target.type === 'series' && target.id) {
      setLoadingMetadata(true);
      fetch(`/api/tmdb/tv/${target.id}`, { credentials: 'include' })
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch TMDB details');
          return res.json();
        })
        .then(data => {
          const validSeasons = (data.seasons ?? []).filter((s: any) => s.season_number > 0 && s.episode_count > 0);
          setSeasonsData(validSeasons);
          if (validSeasons.length > 0) {
            setSeason(validSeasons[0].season_number);
            setEpisode(1);
          }
        })
        .catch(err => {
          console.error('Error fetching show metadata:', err);
        })
        .finally(() => {
          setLoadingMetadata(false);
        });
    }
  }, [target]);

  // Auto-search for movies on mount
  useEffect(() => {
    if (target.type === 'movie') {
      searchTorrents();
    }
  }, [target]);

  const searchTorrents = async (s?: number, ep?: number) => {
    setSearching(true);
    setError('');
    setStreams([]);
    try {
      const res = await fetch('/api/stremio/stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: target.imdbId ?? null,
          title: target.title,
          type: target.type,
          ...(target.type === 'series' ? { season: s ?? season, episode: ep ?? episode } : {})
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(data.error ?? data.message ?? `Server error ${res.status}`);
      }

      const data = await res.json() as {
        streams?: Array<{
          name: string;
          quality: string;
          size: string;
          seeds: string;
          magnet: string;
          infoHash: string;
          source: string;
        }>;
        imdbId?: string;
      };

      const resolvedImdbId = data.imdbId ?? target.imdbId ?? '';
      const found = (data.streams ?? []).slice(0, 15).map(item => ({
        name: item.name,
        title: `${item.quality}${item.size ? ` · ${item.size}` : ''}${item.seeds ? ` · 👤 ${item.seeds}` : ''}`,
        url: item.infoHash,
        imdbId: resolvedImdbId,
        quality: item.quality,
        size: item.size,
        seeds: item.seeds,
        magnet: item.magnet,
        source: item.source,
      }));

      if (found.length === 0) {
        throw new Error(
          target.type === 'series'
            ? `No streams found for Season ${s ?? season} Episode ${ep ?? episode} — try another episode or check your Prowlarr config`
            : 'No streams found — try a different title or check your Prowlarr config'
        );
      }
      setStreams(found);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        msg === 'Failed to fetch'
          ? 'Could not reach the HomeStream server. Make sure the app is running.'
          : msg
      );
    } finally {
      setSearching(false);
    }
  };

  const handleBulkSeriesDownload = async () => {
    setBulkDownloading(true);
    try {
      const body: Record<string, any> = {
        imdbId: target.imdbId || null,
        type: 'series',
        title: target.title,
        poster: target.posterUrl,
        allEpisodes: true,
        totalEpisodes: episodesPerSeason,
        totalSeasons: 15,
      };
      if (selectedSeason !== 'all') {
        body.season = parseInt(selectedSeason);
      }

      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.status === 503) {
        toast.error('Configure qBittorrent or Real-Debrid first.');
        setBulkDownloading(false);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(errData.message ?? errData.error ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { queued?: number; message?: string; vpnUsed?: boolean };
      const count = data.queued ?? 1;
      const vpnText = data.vpnUsed ? ' (Protected by VPN)' : '';
      toast.success(`Queued ${count} episode${count !== 1 ? 's' : ''} of "${target.title}"${vpnText}`);
      onClose();
    } catch (err) {
      toast.error(`Bulk download failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBulkDownloading(false);
    }
  };

  const startDownload = async (stream: StreamResult) => {
    setDownloading(stream.url);
    try {
      const isSeries = target.type === 'series';
      const displayName = isSeries
        ? `${target.title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
        : target.title;

      const res = await fetch('/api/stremio/download', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imdbId: stream.imdbId,
          infoHash: stream.url,
          title: target.title,
          type: target.type,
          quality: stream.quality,
          poster: target.posterUrl,
          ...(isSeries ? { season, episode } : {}),
          streams: [{
            infoHash: stream.url,
            magnet: stream.magnet || `magnet:?xt=urn:btih:${stream.url}`,
            quality: stream.quality,
            name: stream.name,
            size: stream.size,
            seeds: stream.seeds,
            source: stream.source ?? 'torrentio',
          }],
        }),
      });

      if (res.status === 409) {
        const data = await res.json() as { jobId?: string; message?: string };
        toast.custom(() => (
          <div className="flex items-start gap-3 bg-card border border-yellow-500/30 rounded-xl px-4 py-3 shadow-xl max-w-sm">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">Already in queue</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-medium text-foreground">{displayName}</span> is already being downloaded
                {data.jobId ? ` (job ${data.jobId.slice(0, 8)}…)` : ''}.
              </p>
            </div>
          </div>
        ), { duration: 5000 });
        onClose();
        return;
      }

      if (res.status === 503) {
        toast.custom(() => (
          <div className="flex items-start gap-3 bg-card border border-red-500/30 rounded-xl px-4 py-3 shadow-xl max-w-sm">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">No download backend available</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Downloads require qBittorrent or a Real-Debrid API key. Add one in Settings to enable downloads.
              </p>
            </div>
          </div>
        ), { duration: 10000 });
        setDownloading(null);
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(errData.message ?? errData.error ?? `Server error ${res.status}`);
      }

      const data = await res.json() as { vpnUsed?: boolean };
      const vpnText = data.vpnUsed ? ' (Protected by VPN)' : '';
      toast.success(`Download queued — ${displayName}${vpnText}`, {
        description: stream.name,
        duration: 4000,
      });
      onClose();
    } catch (err) {
      toast.error(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <ImageWithFallback
              src={target.posterUrl}
              alt={target.title}
              className="w-8 h-12 rounded object-cover"
              fallbackClassName="w-8 h-12 rounded bg-muted"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">{target.title}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {target.type === 'series' ? 'TV Show' : 'Movie'} · {target.release_date ? formatDate(target.release_date) : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal content body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {target.type === 'series' && (
            <>
              {/* Option Mode selector */}
              <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                <button
                  onClick={() => {
                    setSubMode('episode');
                    setStreams([]);
                    setError('');
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors ${
                    subMode === 'episode'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  Episode Search
                </button>
                <button
                  onClick={() => {
                    setSubMode('bulk');
                    setStreams([]);
                    setError('');
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors ${
                    subMode === 'bulk'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Download Series/Season
                </button>
              </div>

              {subMode === 'bulk' && (
                <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Download Series / Season</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Downloads the best quality ≥720p stream for each episode. Already downloaded episodes are skipped.
                  </p>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-zinc-400">Season</label>
                      <select
                        value={selectedSeason}
                        onChange={e => {
                          const val = e.target.value;
                          setSelectedSeason(val);
                          if (val !== 'all' && seasonsData.length > 0) {
                            const sObj = seasonsData.find(s => s.season_number.toString() === val);
                            if (sObj) setEpisodesPerSeason(sObj.episode_count);
                          }
                        }}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                      >
                        <option value="all">All seasons</option>
                        {seasonsData.length > 0 ? (
                          seasonsData.map((s: any) => (
                            <option key={s.season_number} value={s.season_number.toString()}>
                              Season {s.season_number} ({s.episode_count} Ep)
                            </option>
                          ))
                        ) : (
                          Array.from({ length: 15 }, (_, i) => i + 1).map(s => (
                            <option key={s} value={s.toString()}>Season {s}</option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-zinc-400">Episodes/season</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={episodesPerSeason}
                        onChange={e => setEpisodesPerSeason(Math.max(1, Math.min(100, parseInt(e.target.value) || 12)))}
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary text-center"
                      />
                    </div>
                  </div>

                  <button
                    disabled={bulkDownloading}
                    onClick={handleBulkSeriesDownload}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {bulkDownloading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Queueing episodes…
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download {selectedSeason === 'all' ? 'All Seasons' : `Season ${selectedSeason}`}
                      </>
                    )}
                  </button>
                </div>
              )}

              {subMode === 'episode' && (
                <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListVideo className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">Select Episode to Search</span>
                    </div>
                    {loadingMetadata && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-zinc-400 font-semibold">Season</label>
                      {seasonsData.length > 0 ? (
                        <select
                          value={season}
                          onChange={e => {
                            const sNum = parseInt(e.target.value);
                            setSeason(sNum);
                            setEpisode(1);
                          }}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                        >
                          {seasonsData.map((s: any) => (
                            <option key={s.season_number} value={s.season_number}>
                              Season {s.season_number}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          value={season}
                          onChange={e => {
                            setSeason(Math.max(1, parseInt(e.target.value) || 1));
                            setEpisode(1);
                          }}
                          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary text-center"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-zinc-400 font-semibold">Episode</label>
                      {seasonsData.length > 0 ? (
                        <select
                          value={episode}
                          onChange={e => setEpisode(parseInt(e.target.value))}
                          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary"
                        >
                          {Array.from(
                            { length: seasonsData.find(s => s.season_number === season)?.episode_count ?? 12 },
                            (_, i) => i + 1
                          ).map(epNum => (
                            <option key={epNum} value={epNum}>
                              Episode {epNum}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={1}
                          value={episode}
                          onChange={e => setEpisode(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-primary text-center"
                        />
                      )}
                    </div>
                    <button
                      onClick={() => searchTorrents(season, episode)}
                      disabled={searching}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs rounded-lg font-semibold transition-colors disabled:opacity-50 ml-auto"
                    >
                      {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      Search Torrents
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Torrents search options and results listing */}
          {target.type === 'movie' && streams.length === 0 && !searching && !error && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Search for available torrents to download to your HomeStream server.
              </p>
              <button
                onClick={() => searchTorrents()}
                className="flex items-center gap-2 bg-primary hover:bg-primary/80 text-primary-foreground px-5 py-2.5 rounded-lg font-semibold text-sm mx-auto transition-colors"
              >
                <Search className="w-4 h-4" />
                Search Torrents
              </button>
            </div>
          )}

          {searching && target.type === 'movie' && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Searching for streams…</p>
            </div>
          )}

          {error && (
            <div className="text-center py-4">
              <p className="text-sm text-red-400 mb-3">{error}</p>
              <button
                onClick={() => searchTorrents(target.type === 'series' ? season : undefined, target.type === 'series' ? episode : undefined)}
                className="text-xs text-primary hover:text-primary/80 underline font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {streams.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Select a torrent to download:</p>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {streams.map(s => (
                  <button
                    key={s.url}
                    onClick={() => startDownload(s)}
                    disabled={!!downloading}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                        {s.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                        {s.title}
                      </p>
                    </div>
                    {downloading === s.url ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
