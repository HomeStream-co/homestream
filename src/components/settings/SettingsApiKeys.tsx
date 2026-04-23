import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { SectionHeader, ApiKeyField } from './shared';

export interface ApiKeysState {
  omdbApiKey: string;
  googleAiApiKey: string;
  tmdbApiKey: string;
}

export interface ApiKeysSavedState {
  omdb: boolean;
  googleAi: boolean;
  tmdb: boolean;
}

interface SettingsApiKeysProps {
  apiKeys: ApiKeysState;
  apiKeysSavedState: ApiKeysSavedState;
  apiKeysSaving: boolean;
  apiKeysSaved: boolean;
  onChangeKey: (key: keyof ApiKeysState, value: string) => void;
  onSave: () => void;
  onTestOmdb: () => Promise<{ ok: boolean; message?: string }>;
  onTestTmdb: () => Promise<{ ok: boolean; message?: string }>;
  onTestGemini: () => Promise<{ ok: boolean; message?: string }>;
}

export default function SettingsApiKeys({
  apiKeys, apiKeysSavedState, apiKeysSaving, apiKeysSaved,
  onChangeKey, onSave, onTestOmdb, onTestTmdb, onTestGemini,
}: SettingsApiKeysProps) {
  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={KeyRound} label="API Keys" />
      <div className="px-4 pb-4 divide-y divide-border/30">
        {apiKeysSavedState.omdb && !apiKeys.omdbApiKey && (
          <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
            <CheckCircle2 className="w-3 h-3" /> OMDB key saved — enter a new value to replace it
          </div>
        )}
        <ApiKeyField
          label="OMDB"
          description="Movie metadata (posters, ratings, plot). Get free key at omdbapi.com"
          value={apiKeys.omdbApiKey}
          onChange={v => onChangeKey('omdbApiKey', v)}
          onTest={onTestOmdb}
          placeholder={apiKeysSavedState.omdb ? '(key saved — enter new to replace)' : 'e.g. a1b2c3d4'}
        />

        {apiKeysSavedState.tmdb && !apiKeys.tmdbApiKey && (
          <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
            <CheckCircle2 className="w-3 h-3" /> TMDB key saved — enter a new value to replace it
          </div>
        )}
        <ApiKeyField
          label="TMDB"
          description="Discover page, trending movies & TV. Get key at themoviedb.org"
          value={apiKeys.tmdbApiKey}
          onChange={v => onChangeKey('tmdbApiKey', v)}
          onTest={onTestTmdb}
          placeholder={apiKeysSavedState.tmdb ? '(key saved — enter new to replace)' : 'v3 API key or Bearer token'}
        />

        {apiKeysSavedState.googleAi && !apiKeys.googleAiApiKey && (
          <div className="flex items-center gap-1.5 py-1.5 text-[11px] text-green-400">
            <CheckCircle2 className="w-3 h-3" /> Google AI key saved — enter a new value to replace it
          </div>
        )}
        <ApiKeyField
          label="Google Gemini"
          description="AI enrichment & chat assistant. Get key at aistudio.google.com"
          value={apiKeys.googleAiApiKey}
          onChange={v => onChangeKey('googleAiApiKey', v)}
          onTest={onTestGemini}
          placeholder={apiKeysSavedState.googleAi ? '(key saved — enter new to replace)' : 'AIza…'}
        />

        <div className="pt-3">
          <button
            onClick={onSave}
            disabled={apiKeysSaving}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
              apiKeysSaved
                ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                : 'bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary'
            } disabled:opacity-60`}
          >
            {apiKeysSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
             apiKeysSaved  ? <CheckCircle2 className="w-3.5 h-3.5" /> :
             <KeyRound className="w-3.5 h-3.5" />}
            {apiKeysSaving ? 'Saving…' : apiKeysSaved ? 'Saved!' : 'Save API Keys'}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Keys are stored in homestream-config.json on your server
          </p>
        </div>
      </div>
    </div>
  );
}
