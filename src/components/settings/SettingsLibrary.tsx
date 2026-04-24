import { Library, HardDrive, Tag } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { SectionHeader, Toggle } from './shared';

export default function SettingsLibrary() {
  const { settings, updateSetting } = useTheme();

  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={Library} label="Library" />
      <div className="px-4 pb-3 divide-y divide-border/30">
        <Toggle
          checked={settings.showStorageBadges}
          onChange={v => updateSetting('showStorageBadges', v)}
          label="Storage savings badges"
          description="Show how much disk space was saved after transcoding"
          icon={HardDrive}
        />
        <Toggle
          checked={settings.showEnrichmentTags}
          onChange={v => updateSetting('showEnrichmentTags', v)}
          label="AI enrichment tags"
          description="Show mood and genre tags on media cards"
          icon={Tag}
        />
      </div>
    </div>
  );
}
