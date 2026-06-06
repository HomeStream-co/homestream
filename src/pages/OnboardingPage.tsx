import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  Film, Key, Download, Library, ChevronRight, ChevronLeft,
  Check, Loader2, ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  optional?: boolean;
}

const STEPS: Step[] = [
  { id: 'welcome',  title: 'Welcome to HomeStream',    description: "Your personal media server. Let's get you set up in a few quick steps.",  icon: Film },
  { id: 'apikeys',  title: 'Connect Your API Keys',    description: 'HomeStream uses TMDB and OMDB to fetch metadata for your movies and shows.', icon: Key },
  { id: 'library',  title: 'Add Your First Media',     description: 'Upload a video file or point HomeStream to your existing media folder.',     icon: Library },
  { id: 'download', title: 'Set Up Downloads',         description: 'Connect qBittorrent or configure Prowlarr to automate your media collection.', icon: Download, optional: true },
  { id: 'done',     title: "You're all set!",          description: 'HomeStream is ready. Start exploring your library.',                          icon: Check },
];

function ApiKeysStep({ onNext }: { onNext: () => void }) {
  const [tmdb, setTmdb] = useState('');
  const [omdb, setOmdb] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!tmdb && !omdb) { onNext(); return; }
    setSaving(true);
    try {
      await fetch('/api/settings/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbApiKey: tmdb, omdbApiKey: omdb }),
      });
      toast.success('API keys saved');
      onNext();
    } catch {
      toast.error('Failed to save API keys');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">TMDB API Key</label>
        <input
          type="password"
          value={tmdb}
          onChange={e => setTmdb(e.target.value)}
          placeholder="Enter your TMDB API key"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
        />
        <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
          <ExternalLink className="w-2.5 h-2.5" />Get a free TMDB key
        </a>
      </div>
      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">OMDB API Key</label>
        <input
          type="password"
          value={omdb}
          onChange={e => setOmdb(e.target.value)}
          placeholder="Enter your OMDB API key"
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
        />
        <a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline mt-1">
          <ExternalLink className="w-2.5 h-2.5" />Get a free OMDB key
        </a>
      </div>
      <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {saving ? 'Saving…' : 'Save & Continue'}
      </button>
    </div>
  );
}

function LibraryStep({ onNext }: { onNext: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('video', f));
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    await new Promise<void>((resolve, reject) => {
      xhr.onload = () => xhr.status < 400 ? resolve() : reject();
      xhr.onerror = reject;
      xhr.open('POST', '/api/upload');
      xhr.withCredentials = true;
      xhr.send(formData);
    }).catch(() => {});
    setUploading(false);
    toast.success('Media uploaded!');
    onNext();
  };

  return (
    <div className="flex flex-col gap-4">
      <label className={`flex flex-col items-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${uploading ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-muted/20'}`}>
        <input type="file" accept="video/*" multiple className="hidden" onChange={handleFile} disabled={uploading} />
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-primary font-medium">Uploading… {progress}%</p>
          </>
        ) : (
          <>
            <Library className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Drop video files here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </div>
          </>
        )}
      </label>
      <button onClick={onNext} className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center">
        Skip for now — I&apos;ll add media later
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const navigate = useNavigate();
  const step = STEPS[stepIndex];

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex(i => i + 1);
    else navigate('/');
  };

  const prev = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1);
  };

  const isLast = stepIndex === STEPS.length - 1;

  return (
    <>
      <Helmet>
        <title>Setup — HomeStream</title>
        <meta name="description" content="Set up your HomeStream server." />
      </Helmet>

      <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`rounded-full transition-all ${
                  i === stepIndex ? 'w-6 h-2 bg-primary' :
                  i < stepIndex ? 'w-2 h-2 bg-primary/50' :
                  'w-2 h-2 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-border bg-card p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-heading text-foreground">{step.title}</h1>
                  {step.optional && <span className="text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded-full">Optional</span>}
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-6">{step.description}</p>

              {/* Step-specific content */}
              {step.id === 'apikeys' && <ApiKeysStep onNext={next} />}
              {step.id === 'library' && <LibraryStep onNext={next} />}

              {/* Default next button for non-interactive steps */}
              {(step.id === 'welcome' || step.id === 'download' || step.id === 'done') && (
                <button
                  onClick={isLast ? () => navigate('/') : next}
                  className="w-full py-3 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground font-semibold text-sm transition-all flex items-center justify-center gap-2"
                >
                  {isLast ? 'Go to HomeStream' : 'Continue'}
                  {!isLast && <ChevronRight className="w-4 h-4" />}
                </button>
              )}

              {step.id === 'download' && (
                <button onClick={next} className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1">
                  Skip for now
                </button>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Back button */}
          {stepIndex > 0 && (
            <button onClick={prev} className="flex items-center gap-1.5 mx-auto mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>
          )}
        </div>
      </div>
    </>
  );
}
