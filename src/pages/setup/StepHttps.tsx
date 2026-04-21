/**
 * Setup Step 7 — HTTPS Setup
 * Informational step explaining HTTPS options; links to the full guide.
 */
import {
  Shield, CheckCircle2, ChevronLeft, ChevronRight, Wifi, Globe,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { SetupStepProps } from './types';

export default function StepHttps({ onNext, onBack }: SetupStepProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Enable HTTPS</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Optional but recommended — required for Chromecast, PWA install, and remote streaming.
        </p>
      </div>

      {/* What HTTPS unlocks */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Chromecast casting', desc: 'Requires HTTPS origin' },
          { label: 'PWA install prompt', desc: 'Add to home screen' },
          { label: 'Remote streaming',   desc: 'Outside home WiFi' },
          { label: 'Jellyfin iOS/Android', desc: 'Native app support' },
        ].map(item => (
          <div key={item.label} className="flex items-start gap-2 p-3 rounded-xl bg-muted/40 border border-border">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Setup method cards */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose your setup method</p>
        {[
          {
            icon: Wifi,
            title: 'LAN Only (Self-Signed)',
            desc: 'Caddy internal CA — no domain, no port forwarding. One browser warning to accept once.',
            badge: 'Easiest',
            badgeColor: 'bg-green-500/15 text-green-400',
          },
          {
            icon: Globe,
            title: "Custom Domain (Let's Encrypt)",
            desc: 'Real trusted cert via Caddy. Requires a domain + port 443 open on your router.',
            badge: 'Recommended',
            badgeColor: 'bg-primary/15 text-primary',
          },
          {
            icon: Shield,
            title: 'Cloudflare Tunnel',
            desc: 'Zero open ports. Works behind CGNAT. Free Cloudflare account + domain required.',
            badge: 'No Port Forwarding',
            badgeColor: 'bg-orange-500/15 text-orange-400',
          },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card/60">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-foreground">{s.title}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${s.badgeColor}`}>{s.badge}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        The full step-by-step guide with copy-paste configs is in{' '}
        <button onClick={() => navigate('/https-setup')} className="text-primary hover:underline font-medium">
          Settings → HTTPS Setup
        </button>
        {' '}— you can come back to it any time.
      </p>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" />Back
        </button>
        <button onClick={() => navigate('/https-setup')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 text-sm font-medium transition-colors">
          <Shield className="w-4 h-4" />
          Open HTTPS Setup guide
        </button>
        <button onClick={onNext}
          className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 rounded-xl font-bold text-sm transition-colors">
          Skip for now <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
