/**
 * SettingsTorrentSources
 *
 * Manage the list of torrent indexer sources HomeStream queries when searching
 * for streams. Three built-in sources (Torrentio, Nyaa.si, Prowlarr) can be
 * toggled on/off. Custom Jackett, Torznab, or RSS endpoints can be added and
 * removed.
 */

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Trash2, Globe, Rss, Server, Search, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceType = 'torrentio' | 'nyaa' | 'prowlarr' | 'jackett' | 'torznab' | 'rss';

interface TorrentSource {
  id: string;
  name: string;
  type: SourceType;
  url?: string;
  apiKey?: string;
  enabled: boolean;
  builtIn: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SourceType, string> = {
  torrentio: 'Torrentio',
  nyaa:      'Nyaa.si',
  prowlarr:  'Prowlarr',
  jackett:   'Jackett',
  torznab:   'Torznab',
  rss:       'RSS Feed',
};

const TYPE_DESCRIPTIONS: Record<SourceType, string> = {
  torrentio: 'Public aggregator — queries 1337x, RARBG mirrors, YTS, EZTV and more via IMDB ID. No setup needed.',
  nyaa:      'Best source for anime. Public API, no account required.',
  prowlarr:  'Self-hosted indexer proxy. Queries 500+ trackers. Requires Prowlarr running locally.',
  jackett:   'Self-hosted indexer proxy (older alternative to Prowlarr). Requires Jackett running locally.',
  torznab:   'Torznab-compatible endpoint (Jackett, Prowlarr, or any Torznab server).',
  rss:       'Any RSS/Atom torrent feed URL (e.g. a private tracker\'s RSS feed).',
};

function sourceIcon(type: SourceType) {
  if (type === 'rss') return <Rss className="w-4 h-4" />;
  if (type === 'jackett' || type === 'prowlarr' || type === 'torznab') return <Server className="w-4 h-4" />;
  return <Globe className="w-4 h-4" />;
}

function sourceBadgeVariant(type: SourceType): 'default' | 'secondary' | 'outline' {
  if (type === 'torrentio' || type === 'nyaa') return 'default';
  if (type === 'prowlarr' || type === 'jackett' || type === 'torznab') return 'secondary';
  return 'outline';
}

// ── Add source dialog ─────────────────────────────────────────────────────────

interface AddDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (source: { name: string; type: SourceType; url?: string; apiKey?: string }) => Promise<void>;
}

function AddSourceDialog({ open, onOpenChange, onAdd }: AddDialogProps) {
  const [name, setName]     = useState('');
  const [type, setType]     = useState<SourceType>('jackett');
  const [url, setUrl]       = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const needsUrl = ['jackett', 'torznab', 'rss'].includes(type);

  const handleAdd = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (needsUrl && !url.trim()) { toast.error('URL is required for this source type'); return; }
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), type, url: url.trim() || undefined, apiKey: apiKey.trim() || undefined });
      setName(''); setUrl(''); setApiKey(''); setType('jackett');
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Add Torrent Source
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type picker */}
          <div className="space-y-1.5">
            <Label>Source type</Label>
            <Select value={type} onValueChange={v => setType(v as SourceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['jackett', 'torznab', 'prowlarr', 'rss'] as SourceType[]).map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{TYPE_DESCRIPTIONS[type]}</p>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`My ${TYPE_LABELS[type]}`}
            />
          </div>

          {/* URL */}
          {needsUrl && (
            <div className="space-y-1.5">
              <Label>Base URL</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={
                  type === 'jackett'  ? 'http://localhost:9117' :
                  type === 'torznab'  ? 'http://localhost:9117/torznab/all' :
                  'https://example.com/rss?passkey=...'
                }
              />
            </div>
          )}

          {/* API key — optional for jackett/torznab */}
          {(type === 'jackett' || type === 'torznab') && (
            <div className="space-y-1.5">
              <Label>API key <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Jackett global API key"
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Found in Jackett → Dashboard → API Key
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add Source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsTorrentSources() {
  const [sources, setSources]     = useState<TorrentSource[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addOpen, setAddOpen]     = useState(false);
  const [toggling, setToggling]   = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/torrent-sources', { credentials: 'include' })
      .then(r => r.json())
      .then((d: { sources?: TorrentSource[] }) => setSources(d.sources ?? []))
      .catch(() => toast.error('Failed to load torrent sources'))
      .finally(() => setLoading(false));
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const mutate = async (body: object): Promise<TorrentSource[]> => {
    const res = await fetch('/api/torrent-sources', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error ?? `Server error ${res.status}`);
    }
    const d = await res.json() as { sources: TorrentSource[] };
    return d.sources;
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      const updated = await mutate({ action: 'toggle', id, enabled });
      setSources(updated);
    } catch (err) {
      toast.error(`Failed to update source: ${String(err)}`);
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const updated = await mutate({ action: 'delete', id });
      setSources(updated);
      toast.success(`Removed "${name}"`);
    } catch (err) {
      toast.error(`Failed to remove source: ${String(err)}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleAdd = async (source: { name: string; type: SourceType; url?: string; apiKey?: string }) => {
    const updated = await mutate({ action: 'add', source });
    setSources(updated);
    toast.success(`Added "${source.name}"`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const builtIns  = sources.filter(s => s.builtIn);
  const customs   = sources.filter(s => !s.builtIn);
  const enabledCount = sources.filter(s => s.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Torrent Sources</h2>
        <p className="text-sm text-muted-foreground">
          Control which indexers HomeStream queries when you click Download on a movie or show.
          Sources are queried in parallel — results are merged and sorted by seed count.
        </p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
        {enabledCount > 0
          ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
        }
        <p className="text-sm text-foreground">
          {enabledCount === 0
            ? 'No sources enabled — downloads will return no results'
            : `${enabledCount} source${enabledCount !== 1 ? 's' : ''} active`
          }
        </p>
      </div>

      {/* Built-in sources */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Built-in Sources</p>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sources…
          </div>
        ) : (
          builtIns.map(src => (
            <SourceRow
              key={src.id}
              source={src}
              toggling={toggling === src.id}
              deleting={false}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Custom sources */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Sources</p>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="h-7 text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Add Source
          </Button>
        </div>

        {customs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <Search className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No custom sources yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add Jackett, Torznab, or RSS feeds to expand your search coverage
            </p>
          </div>
        ) : (
          customs.map(src => (
            <SourceRow
              key={src.id}
              source={src}
              toggling={toggling === src.id}
              deleting={deleting === src.id}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">How sources work</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
          <li><span className="font-medium text-foreground">Torrentio</span> — free public service, no setup. Covers most movies and shows.</li>
          <li><span className="font-medium text-foreground">Nyaa.si</span> — best for anime. Public, no account needed.</li>
          <li><span className="font-medium text-foreground">Prowlarr / Jackett</span> — self-hosted proxies that query 500+ private and public trackers.</li>
          <li><span className="font-medium text-foreground">Torznab / RSS</span> — direct feed from any compatible tracker or private site.</li>
        </ul>
      </div>

      <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />
    </div>
  );
}

// ── Source row ────────────────────────────────────────────────────────────────

interface RowProps {
  source: TorrentSource;
  toggling: boolean;
  deleting: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string, name: string) => void;
}

function SourceRow({ source, toggling, deleting, onToggle, onDelete }: RowProps) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors ${
      source.enabled ? 'bg-card border-border' : 'bg-muted/30 border-border/50 opacity-60'
    }`}>
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 ${source.enabled ? 'text-primary' : 'text-muted-foreground'}`}>
        {sourceIcon(source.type)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">{source.name}</span>
          <Badge variant={sourceBadgeVariant(source.type)} className="text-[10px] px-1.5 py-0">
            {TYPE_LABELS[source.type]}
          </Badge>
          {source.builtIn && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">built-in</Badge>
          )}
        </div>
        {source.url && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{source.url}</p>
        )}
        {!source.url && (
          <p className="text-xs text-muted-foreground mt-0.5">{TYPE_DESCRIPTIONS[source.type].split('.')[0]}.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {toggling
          ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          : (
            <Switch
              checked={source.enabled}
              onCheckedChange={v => onToggle(source.id, v)}
              aria-label={`Toggle ${source.name}`}
            />
          )
        }
        {!source.builtIn && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(source.id, source.name)}
            disabled={deleting}
            aria-label={`Remove ${source.name}`}
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
        )}
      </div>
    </div>
  );
}
