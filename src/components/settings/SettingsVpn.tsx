import { WifiOff, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { SectionHeader } from './shared';

export interface VpnInterface {
  name: string;
  displayName?: string;
  address: string;
  likelyVpn: boolean;
  internal: boolean;
  family: string;
}

interface SettingsVpnProps {
  vpnInterfaces: VpnInterface[];
  vpnCurrentInterface: string | null;
  vpnSelectedInterface: string;
  vpnBindState: 'idle' | 'saving' | 'ok' | 'error';
  vpnBindMsg: string;
  onSelectInterface: (name: string) => void;
  onBind: () => void;
}

export default function SettingsVpn({
  vpnInterfaces, vpnCurrentInterface, vpnSelectedInterface,
  vpnBindState, vpnBindMsg,
  onSelectInterface, onBind,
}: SettingsVpnProps) {
  return (
    <div className="border-t border-border/50">
      <SectionHeader icon={WifiOff} label="VPN Kill-Switch" />
      <div className="px-4 pb-4 flex flex-col gap-3">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Lock downloads to your VPN adapter. If the VPN disconnects, all downloads pause
          automatically so your real IP is never exposed.
        </p>

        {/* Linux root-requirement notice */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] text-amber-300 font-medium">Linux: WireGuard requires root</p>
            <p className="text-[10px] text-amber-300/70 leading-relaxed">
              <code className="font-mono">wg-quick</code> needs root or a sudoers entry.
              Run the installer to add it automatically:
            </p>
            <code className="text-[9px] font-mono text-amber-200/60 mt-0.5 break-all">
              echo &quot;$(whoami) ALL=(ALL) NOPASSWD: /usr/bin/wg-quick&quot; | sudo tee /etc/sudoers.d/homestream-wg
            </code>
          </div>
        </div>

        {/* Current binding status */}
        {vpnCurrentInterface ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <p className="text-[11px] text-green-300">
              Kill-switch active — bound to{' '}
              <span className="font-mono font-semibold">{vpnCurrentInterface}</span>
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border">
            <WifiOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              No VPN binding — downloads use any available interface
            </p>
          </div>
        )}

        {/* Adapter selector */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-muted-foreground">VPN Adapter</label>
          <select
            value={vpnSelectedInterface}
            onChange={e => onSelectInterface(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="">— Disable kill-switch —</option>
            {vpnInterfaces.map(i => (
              <option key={`${i.name}-${i.address}`} value={i.name}>
                {i.likelyVpn ? '🔒 ' : ''}{i.displayName || i.name} ({i.address})
              </option>
            ))}
          </select>
          {vpnInterfaces.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              No adapters detected — connect your VPN first, then reopen Settings.
            </p>
          )}
        </div>

        <button
          onClick={onBind}
          disabled={vpnBindState === 'saving' || vpnSelectedInterface === (vpnCurrentInterface ?? '')}
          className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors disabled:opacity-40"
        >
          {vpnBindState === 'saving'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
            : vpnBindState === 'ok'
              ? <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" />Saved</>
              : <><WifiOff className="w-3.5 h-3.5" />{vpnSelectedInterface ? 'Apply VPN Binding' : 'Clear VPN Binding'}</>
          }
        </button>

        {vpnBindMsg && (
          <p className={`text-[11px] ${vpnBindState === 'error' ? 'text-destructive' : 'text-green-400'}`}>
            {vpnBindMsg}
          </p>
        )}
      </div>
    </div>
  );
}
