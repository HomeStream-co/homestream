import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Settings2, Palette, Key, Database, Compass, Download,
  Library, Shield, Play, Wrench, HardDrive, Cpu, Wifi,
  Activity, ChevronRight,
} from 'lucide-react';
import SettingsAppearance from '@/components/settings/SettingsAppearance';
import SettingsBackup from '@/components/settings/SettingsBackup';
import SettingsDownloads from '@/components/settings/SettingsDownloads';
import SettingsLibrary from '@/components/settings/SettingsLibrary';
import SettingsPlayback from '@/components/settings/SettingsPlayback';
import SettingsProwlarr from '@/components/settings/SettingsProwlarr';
import SettingsTranscode from '@/components/settings/SettingsTranscode';
import {
  SettingsApiKeysWrapper,
  SettingsDiscoverWrapper,
  SettingsParentalControlsWrapper,
  SettingsSessionWrapper,
  SettingsStorageWrapper,
  SettingsToolsWrapper,
  SettingsVpnWrapper,
} from '@/components/settings/wrappers';
import DebugPanel from '@/components/DebugPanel';

type SettingsTab =
  | 'appearance' | 'apikeys' | 'backup' | 'discover' | 'downloads'
  | 'library' | 'parental' | 'playback' | 'prowlarr' | 'session'
  | 'storage' | 'tools' | 'transcode' | 'vpn' | 'debug';

interface NavItem {
  id: SettingsTab;
  label: string;
  icon: React.ElementType;
  group: string;
}

const NAV: NavItem[] = [
  { id: 'appearance',  label: 'Appearance',        icon: Palette,   group: 'General' },
  { id: 'playback',    label: 'Playback',           icon: Play,      group: 'General' },
  { id: 'session',     label: 'Session',            icon: Activity,  group: 'General' },
  { id: 'parental',    label: 'Parental Controls',  icon: Shield,    group: 'General' },
  { id: 'library',     label: 'Library',            icon: Library,   group: 'Media' },
  { id: 'storage',     label: 'Storage',            icon: HardDrive, group: 'Media' },
  { id: 'transcode',   label: 'Transcoding',        icon: Cpu,       group: 'Media' },
  { id: 'downloads',   label: 'Downloads',          icon: Download,  group: 'Automation' },
  { id: 'prowlarr',    label: 'Prowlarr',           icon: Compass,   group: 'Automation' },
  { id: 'discover',    label: 'Discover Sources',   icon: Compass,   group: 'Automation' },
  { id: 'vpn',         label: 'VPN',                icon: Wifi,      group: 'Network' },
  { id: 'apikeys',     label: 'API Keys',           icon: Key,       group: 'Advanced' },
  { id: 'backup',      label: 'Backup & Restore',   icon: Database,  group: 'Advanced' },
  { id: 'tools',       label: 'Tools',              icon: Wrench,    group: 'Advanced' },
  { id: 'debug',       label: 'Debug & Diagnostics',icon: Activity,  group: 'Advanced' },
];

const GROUPS = ['General', 'Media', 'Automation', 'Network', 'Advanced'];

function SettingsContent({ tab, onOpenDebug }: { tab: SettingsTab; onOpenDebug: () => void }) {
  switch (tab) {
    case 'appearance': return <SettingsAppearance />;
    case 'apikeys':    return <SettingsApiKeysWrapper />;
    case 'backup':     return <SettingsBackup />;
    case 'discover':   return <SettingsDiscoverWrapper />;
    case 'downloads':  return <SettingsDownloads />;
    case 'library':    return <SettingsLibrary />;
    case 'parental':   return <SettingsParentalControlsWrapper />;
    case 'playback':   return <SettingsPlayback />;
    case 'prowlarr':   return <SettingsProwlarr onSaved={() => {}} />;
    case 'session':    return <SettingsSessionWrapper />;
    case 'storage':    return <SettingsStorageWrapper />;
    case 'tools':      return <SettingsToolsWrapper onOpenDebug={onOpenDebug} />;
    case 'transcode':  return <SettingsTranscode />;
    case 'vpn':        return <SettingsVpnWrapper />;
    case 'debug':      return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Debug &amp; Diagnostics</h2>
          <p className="text-sm text-muted-foreground">Run health checks, view system info, and repair common issues.</p>
        </div>
        <button
          onClick={onOpenDebug}
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left group max-w-sm"
        >
          <Activity className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Open Debug Panel</p>
            <p className="text-xs text-muted-foreground">Health checks, quick fixes, crash log</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </div>
    );
    default: return null;
  }
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [debugOpen, setDebugOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const activeItem = NAV.find(n => n.id === activeTab);

  return (
    <>
      <Helmet>
        <title>Settings — HomeStream</title>
        <meta name="description" content="Configure your HomeStream server." />
      </Helmet>

      <div className="pt-16 min-h-screen flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-border bg-card/50 pt-6 pb-8 overflow-y-auto">
          <div className="px-4 mb-4">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Settings</span>
            </div>
          </div>
          {GROUPS.map(group => {
            const items = NAV.filter(n => n.group === group);
            return (
              <div key={group} className="mb-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-1">{group}</p>
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors text-left ${
                      activeTab === item.id
                        ? 'bg-primary/10 text-primary border-r-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </aside>

        {/* Mobile nav */}
        <div className="md:hidden fixed top-16 left-0 right-0 z-20 bg-card border-b border-border px-4 py-2">
          <button
            onClick={() => setMobileNavOpen(v => !v)}
            className="flex items-center gap-2 text-sm text-foreground font-medium"
          >
            {activeItem && <activeItem.icon className="w-4 h-4 text-primary" />}
            {activeItem?.label}
            <ChevronRight className={`w-3.5 h-3.5 ml-auto transition-transform ${mobileNavOpen ? 'rotate-90' : ''}`} />
          </button>
          {mobileNavOpen && (
            <div className="absolute top-full left-0 right-0 bg-card border-b border-border shadow-lg max-h-64 overflow-y-auto">
              {NAV.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pt-6 md:pt-6 mt-10 md:mt-0 px-4 sm:px-6 lg:px-8 pb-16 max-w-3xl">
          <SettingsContent tab={activeTab} onOpenDebug={() => setDebugOpen(true)} />
        </main>
      </div>

      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} />
    </>
  );
}
