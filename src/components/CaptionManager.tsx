/**
 * CaptionManager
 * Shown on every library card below the CC pill.
 * Re-fetch CC from OpenSubtitles or upload your own .srt/.vtt.
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Captions, RefreshCw, Upload, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, Loader2, X, FileText,
} from 'lucide-react';
import { toast } from 'sonner';

type LangStatus = 'downloaded' | 'stub' | 'exists' | 'error' | undefined;

interface CaptionState {
  en?: LangStatus;
  es?: LangStatus;
}

interface CaptionManagerProps {
  mediaId: string;
  title: string;
  captions?: CaptionState;
  onUpdated: () => void;
}

type FetchStatus = 'idle' | 'fetching' | 'done' | 'error';
type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

function ccPillColor(status: LangStatus): string {
  if (status === 'downloaded' || status === 'exists') return 'text-primary bg-primary/10 border-primary/20';
  if (status === 'stub') return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
  if (status === 'error') return 'text-destructive bg-destructive/10 border-destructive/20';
  return 'text-muted-foreground bg-muted border-border';
}

function ccLabel(status: LangStatus): string {
  if (status === 'downloaded') return '✓ Downloaded';
  if (status === 'exists') return '✓ On disk';
  if (status === 'stub') return '~ Stub only';
  if (status === 'error') return '✗ Error';
  return '— None';
}

export default function CaptionManager({ mediaId, title, captions, onUpdated }: CaptionManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [fetchResult, setFetchResult] = useState<{ en?: string; es?: string } | null>(null);
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({ en: 'idle', es: 'idle' });
  const [uploadLang, setUploadLang] = useState<'en' | 'es'>('en');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRefetch = async () => {
    setFetchStatus('fetching');
    setFetchResult(null);
    try {
      const res = await fetch(`/api/captions/${mediaId}/fetch`, { method: 'POST', credentials: 'include' });
      const data = await res.json() as { success: boolean; langs?: Record<string, string>; message?: string };
      if (data.success) {
        setFetchStatus('done');
        setFetchResult(data.langs ?? null);
        const downloaded = Object.entries(data.langs ?? {})
          .filter(([, v]) => v === 'downloaded')
          .map(([k]) => k.toUpperCase());
        if (downloaded.length > 0) {
          toast.success(`CC downloaded for "${title}" — ${downloaded.join(', ')}`);
        } else {
          toast.info(`No new subtitles found for "${title}" — stubs saved`);
        }
        onUpdated();
      } else {
        setFetchStatus('error');
        toast.error('Caption fetch failed');
      }
    } catch {
      setFetchStatus('error');
      toast.error('Could not reach caption server');
    }
  };

  const uploadFile = async (file: File, lang: 'en' | 'es') => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['srt', 'vtt'].includes(ext)) {
      toast.error('Only .srt and .vtt files are supported');
      return;
    }
    setUploadStatus(prev => ({ ...prev, [lang]: 'uploading' }));
    const formData = new FormData();
    formData.append('subtitle', file);
    formData.append('lang', lang);
    try {
      const res = await fetch(`/api/captions/${mediaId}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json() as { success: boolean; message?: string };
      if (data.success) {
        setUploadStatus(prev => ({ ...prev, [lang]: 'done' }));
        toast.success(`${lang.toUpperCase()} subtitles uploaded for "${title}"`);
        onUpdated();
        setTimeout(() => setUploadStatus(prev => ({ ...prev, [lang]: 'idle' })), 3000);
      } else {
        setUploadStatus(prev => ({ ...prev, [lang]: 'error' }));
        toast.error(data.message ?? 'Upload failed');
      }
    } catch {
      setUploadStatus(prev => ({ ...prev, [lang]: 'error' }));
      toast.error('Upload failed — check server connection');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file, uploadLang);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, uploadLang);
    e.target.value = '';
  };

  const hasAny = captions?.en === 'downloaded' || captions?.en === 'exists'
    || captions?.es === 'downloaded' || captions?.es === 'exists';
  const hasStubOnly = !hasAny && (captions?.en === 'stub' || captions?.es === 'stub');

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-1 group/cc"
        title="Manage closed captions"
      >
        <div className="flex items-center gap-1 min-w-0">
          <Captions className={`w-2.5 h-2.5 flex-shrink-0 ${hasAny ? 'text-primary' : hasStubOnly ? 'text-yellow-500' : 'text-muted-foreground'}`} />
          <span className={`text-[9px] font-medium truncate ${hasAny ? 'text-primary' : hasStubOnly ? 'text-yellow-500' : 'text-muted-foreground'}`}>
            {hasAny
              ? `CC ${[captions?.en && captions.en !== 'stub' ? 'EN' : null, captions?.es && captions.es !== 'stub' ? 'ES' : null].filter(Boolean).join('·')}`
              : hasStubOnly
              ? 'CC stub'
              : 'No CC'}
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground group-hover/cc:text-foreground transition-colors flex-shrink-0">
          {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-2.5 rounded-xl border border-border bg-card space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {(['en', 'es'] as const).map(lang => {
                  const status = captions?.[lang];
                  return (
                    <div key={lang} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-medium ${ccPillColor(status)}`}>
                      <span className="uppercase font-bold">{lang}</span>
                      <span className="truncate">{ccLabel(status)}</span>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleRefetch}
                disabled={fetchStatus === 'fetching'}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors bg-primary/8 hover:bg-primary/15 border-primary/20 text-primary disabled:opacity-50"
              >
                {fetchStatus === 'fetching' ? <Loader2 className="w-3 h-3 animate-spin" /> :
                 fetchStatus === 'done' ? <CheckCircle2 className="w-3 h-3" /> :
                 fetchStatus === 'error' ? <AlertCircle className="w-3 h-3" /> :
                 <RefreshCw className="w-3 h-3" />}
                {fetchStatus === 'fetching' ? 'Fetching…' :
                 fetchStatus === 'done' ? 'Fetched!' :
                 fetchStatus === 'error' ? 'Retry fetch' :
                 'Re-fetch CC from OpenSubtitles'}
              </button>

              {fetchResult && fetchStatus === 'done' && (
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(fetchResult).map(([lang, status]) => (
                    <p key={lang} className={`text-[9px] text-center ${status === 'downloaded' ? 'text-green-400' : 'text-muted-foreground'}`}>
                      {lang.toUpperCase()}: {status}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[9px] text-muted-foreground">or upload your own</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="flex gap-1.5">
                {(['en', 'es'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => setUploadLang(lang)}
                    className={`flex-1 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                      uploadLang === lang
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-muted/30'
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".srt,.vtt" className="hidden" onChange={handleFileInput} />
                {uploadStatus[uploadLang] === 'uploading' ? (
                  <div className="flex flex-col items-center gap-1">
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    <p className="text-[9px] text-primary">Uploading…</p>
                  </div>
                ) : uploadStatus[uploadLang] === 'done' ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <p className="text-[9px] text-green-400">{uploadLang.toUpperCase()} uploaded!</p>
                  </div>
                ) : uploadStatus[uploadLang] === 'error' ? (
                  <div className="flex flex-col items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <p className="text-[9px] text-destructive">Upload failed — try again</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <Upload className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <p className="text-[9px] text-muted-foreground leading-snug">
                      Drop <span className="font-semibold text-foreground">{uploadLang.toUpperCase()}</span> .srt or .vtt
                    </p>
                    <p className="text-[8px] text-muted-foreground/60">or click to browse</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setExpanded(false)}
                className="w-full flex items-center justify-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
              >
                <X className="w-2.5 h-2.5" /> Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
