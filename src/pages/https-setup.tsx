/**
 * /https-setup — Interactive HTTPS / Caddy setup guide.
 *
 * Generates ready-to-paste Caddyfile configs based on the user's
 * actual LAN IP (fetched from /api/network/info).
 *
 * Covers three scenarios:
 *   1. LAN-only  — self-signed cert via Caddy's internal CA (no domain needed)
 *   2. Domain    — Let's Encrypt via Caddy automatic HTTPS (requires port 80/443 open)
 *   3. Cloudflare Tunnel — zero open ports, works behind CGNAT
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, Globe, Cloud, Copy, Check, ChevronRight,
  ChevronLeft, ExternalLink, Loader2, CheckCircle2,
  AlertCircle, RefreshCw, Wifi, Lock, Terminal,
  ArrowLeft, Info, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NetworkInfo {
  hostname: string;
  lanIPs: string[];
  primary: string;
  port: number;
}

type Scenario = 'lan' | 'domain' | 'cloudflare';
type Step = 'choose' | 'configure' | 'install' | 'verify';

// ── Helpers ───────────────────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-border bg-black/40">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/60">
          <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">{label}</span>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      {!label && (
        <button
          onClick={copy}
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-card/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
      )}
      <pre className="p-4 text-sm text-green-300 font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
      done ? 'bg-green-500 text-white' : active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
    }`}>
      {done ? <Check className="w-3.5 h-3.5" /> : n}
    </div>
  );
}

// ── Scenario cards ─────────────────────────────────────────────────────────────

const SCENARIOS: { id: Scenario; icon: React.ElementType; title: string; subtitle: string; badge: string; badgeColor: string; pros: string[]; cons: string[] }[] = [
  {
    id: 'lan',
    icon: Wifi,
    title: 'LAN Only (Self-Signed)',
    subtitle: 'HTTPS on your home network — no domain, no port forwarding',
    badge: 'Easiest',
    badgeColor: 'bg-green-500/20 text-green-400',
    pros: ['No domain needed', 'No router changes', 'Works offline', 'Unblocks Chromecast + PWA'],
    cons: ['Browser shows "Not Secure" warning once', 'Only works on home WiFi'],
  },
  {
    id: 'domain',
    icon: Globe,
    title: 'Custom Domain (Let\'s Encrypt)',
    subtitle: 'Real trusted cert — stream from anywhere with a domain name',
    badge: 'Recommended',
    badgeColor: 'bg-primary/20 text-primary',
    pros: ['Trusted cert — no browser warnings', 'Stream from anywhere', 'Works with all Jellyfin clients'],
    cons: ['Requires a domain (~$10/yr)', 'Must open port 443 on router', 'Dynamic IP needs DDNS'],
  },
  {
    id: 'cloudflare',
    icon: Cloud,
    title: 'Cloudflare Tunnel',
    subtitle: 'Zero open ports — works even behind CGNAT or strict firewalls',
    badge: 'No Port Forwarding',
    badgeColor: 'bg-orange-500/20 text-orange-400',
    pros: ['Zero open ports', 'Free tier available', 'Works behind CGNAT', 'Trusted cert automatically'],
    cons: ['Requires Cloudflare account + domain', 'Cloudflare sees your traffic', 'Slightly higher latency'],
  },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HttpsSetupPage() {
  const navigate = useNavigate();
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [step, setStep] = useState<Step>('choose');
  const [domain, setDomain] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<'ok' | 'fail' | null>(null);
  const [customPort, setCustomPort] = useState('3000');

  // Fetch LAN info on mount
  useEffect(() => {
    fetch('/api/network/info')
      .then(r => r.ok ? r.json() as Promise<NetworkInfo> : Promise.reject())
      .then(info => { setNetworkInfo(info); setCustomPort(String(info.port)); })
      .catch(() => setNetworkInfo({ hostname: 'homestream', lanIPs: [], primary: '192.168.1.100', port: 3000 }))
      .finally(() => setNetLoading(false));
  }, []);

  const ip = networkInfo?.primary ?? '192.168.1.100';
  const port = customPort || '3000';
  const effectiveDomain = domain.trim() || 'homestream.yourdomain.com';

  // ── Caddyfile generators ───────────────────────────────────────────────────

  const caddyfileLan = `# Caddyfile — LAN self-signed HTTPS
# Place this file at /etc/caddy/Caddyfile (Linux/Mac)
# or C:\\caddy\\Caddyfile (Windows)

{
  # Use Caddy's internal CA — generates a trusted local cert
  local_certs
}

https://${ip} {
  reverse_proxy localhost:${port}
}

# Optional: also serve on homestream.local if mDNS is working
# https://homestream.local {
#   reverse_proxy localhost:${port}
# }`;

  const caddyfileDomain = `# Caddyfile — Let's Encrypt automatic HTTPS
# Caddy handles cert issuance and renewal automatically.
# Requirements:
#   - Port 80 and 443 forwarded to this machine on your router
#   - DNS A record: ${effectiveDomain} → your public IP
#   - If your IP changes, use a DDNS service (DuckDNS, Cloudflare, etc.)

${effectiveDomain} {
  reverse_proxy localhost:${port}
}`;

  const cloudflaredInstall = `# 1. Install cloudflared (pick your OS)

# macOS (Homebrew)
brew install cloudflare/cloudflare/cloudflared

# Linux (Debian/Ubuntu)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Windows — download from:
# https://github.com/cloudflare/cloudflared/releases/latest`;

  const cloudflaredTunnel = `# 2. Authenticate and create a tunnel
cloudflared tunnel login
cloudflared tunnel create homestream

# 3. Create config file at ~/.cloudflared/config.yml
tunnel: homestream
credentials-file: ~/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: ${effectiveDomain}
    service: http://localhost:${port}
  - service: http_status:404

# 4. Route DNS (creates a CNAME automatically)
cloudflared tunnel route dns homestream ${effectiveDomain}

# 5. Run the tunnel
cloudflared tunnel run homestream

# 6. (Optional) Install as a system service so it starts on boot
cloudflared service install`;

  const trustCertCommands = `# macOS — trust Caddy's local CA once
sudo security add-trusted-cert -d -r trustRoot \\
  -k /Library/Keychains/System.keychain \\
  $(caddy environ | grep CADDY_DATA | cut -d= -f2)/pki/authorities/local/root.crt

# Linux — trust Caddy's local CA once
caddy trust

# Windows — run in PowerShell as Administrator
caddy trust`;

  // ── Verify HTTPS connection ────────────────────────────────────────────────

  const verifyHttps = useCallback(async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      // Try to hit our own health endpoint over HTTPS
      const target = scenario === 'lan'
        ? `https://${ip}/api/health`
        : `https://${effectiveDomain}/api/health`;
      const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
      setVerifyResult(res.ok ? 'ok' : 'fail');
    } catch {
      setVerifyResult('fail');
    } finally {
      setVerifying(false);
    }
  }, [scenario, ip, effectiveDomain]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const steps: Step[] = ['choose', 'configure', 'install', 'verify'];
  const stepIdx = steps.indexOf(step);

  return (
    <>
      <title>HTTPS Setup — HomeStream</title>
      <meta name="description" content="Set up HTTPS with Caddy for secure remote streaming" />

      <div className="min-h-screen bg-background text-foreground">
        {/* Header bar */}
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="font-semibold text-foreground">HTTPS Setup</h1>
            <span className="text-muted-foreground text-sm">— Secure Remote Streaming</span>

            {/* Step progress */}
            {scenario && (
              <div className="ml-auto flex items-center gap-1.5">
                {steps.map((s, i) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full transition-colors ${
                      i < stepIdx ? 'bg-green-500' : i === stepIdx ? 'bg-primary' : 'bg-muted'
                    }`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8 pb-24">

          {/* Network info banner */}
          {!netLoading && networkInfo && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border text-sm"
            >
              <Wifi className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-muted-foreground">Detected server:</span>
              <code className="text-foreground font-mono">{networkInfo.primary}:{networkInfo.port}</code>
              {networkInfo.lanIPs.length > 1 && (
                <span className="text-muted-foreground text-xs ml-1">
                  (+{networkInfo.lanIPs.length - 1} more interface{networkInfo.lanIPs.length > 2 ? 's' : ''})
                </span>
              )}
              <span className="ml-auto text-muted-foreground text-xs font-mono">{networkInfo.hostname}</span>
            </motion.div>
          )}

          <AnimatePresence mode="wait">

            {/* ── Step 1: Choose scenario ── */}
            {step === 'choose' && (
              <motion.div
                key="choose"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Choose your HTTPS setup</h2>
                  <p className="text-muted-foreground">
                    HTTPS is required for Chromecast, PWA install, and streaming outside your home network.
                    Pick the option that fits your situation.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  {SCENARIOS.map(s => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setScenario(s.id); setStep('configure'); }}
                        className={`w-full text-left p-5 rounded-2xl border transition-all group ${
                          scenario === s.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-foreground">{s.title}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${s.badgeColor}`}>
                                {s.badge}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{s.subtitle}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {s.pros.map(p => (
                                <div key={p} className="flex items-start gap-1.5 text-xs text-green-400">
                                  <Check className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                  <span>{p}</span>
                                </div>
                              ))}
                              {s.cons.map(c => (
                                <div key={c} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <span className="text-muted-foreground/50 mt-0.5 flex-shrink-0">–</span>
                                  <span>{c}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors mt-1 flex-shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step 2: Configure ── */}
            {step === 'configure' && scenario && (
              <motion.div
                key="configure"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Configure</h2>
                  <p className="text-muted-foreground text-sm">
                    {scenario === 'lan' && 'Confirm your server IP and port. Caddy will generate a self-signed cert for your LAN.'}
                    {scenario === 'domain' && 'Enter your domain name. Caddy will automatically obtain a Let\'s Encrypt certificate.'}
                    {scenario === 'cloudflare' && 'Enter the domain you\'ll use for your Cloudflare Tunnel.'}
                  </p>
                </div>

                <div className="flex flex-col gap-5">
                  {/* Server port */}
                  <div className="p-5 rounded-2xl bg-card border border-border">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      HomeStream port
                    </label>
                    <input
                      type="text"
                      value={customPort}
                      onChange={e => setCustomPort(e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                      placeholder="3000"
                    />
                    <p className="text-xs text-muted-foreground mt-1.5">
                      The port HomeStream is running on (default: 3000). Caddy will proxy to this.
                    </p>
                  </div>

                  {/* LAN IP (read-only for lan scenario) */}
                  {scenario === 'lan' && (
                    <div className="p-5 rounded-2xl bg-card border border-border">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Server LAN IP
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ip}
                          readOnly
                          className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none opacity-70"
                        />
                        <div className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Auto-detected
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Caddy will serve HTTPS on this IP. Devices on your LAN connect to <code className="text-foreground">https://{ip}</code>
                      </p>
                    </div>
                  )}

                  {/* Domain input for domain / cloudflare */}
                  {(scenario === 'domain' || scenario === 'cloudflare') && (
                    <div className="p-5 rounded-2xl bg-card border border-border">
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Your domain name
                      </label>
                      <input
                        type="text"
                        value={domain}
                        onChange={e => setDomain(e.target.value)}
                        placeholder="homestream.yourdomain.com"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {scenario === 'domain'
                          ? 'Create a DNS A record pointing this subdomain to your public IP before proceeding.'
                          : 'This will be the public URL for your Cloudflare Tunnel. You must own this domain in Cloudflare.'}
                      </p>
                    </div>
                  )}

                  {/* DNS instructions for domain scenario */}
                  {scenario === 'domain' && (
                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 flex gap-3">
                      <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Before continuing:</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          <li>Find your public IP at <a href="https://ifconfig.me" target="_blank" rel="noreferrer" className="text-primary underline">ifconfig.me</a></li>
                          <li>Add a DNS <strong className="text-foreground">A record</strong>: <code className="text-foreground">{effectiveDomain}</code> → your public IP</li>
                          <li>Forward ports <strong className="text-foreground">80</strong> and <strong className="text-foreground">443</strong> to this machine on your router</li>
                          <li>If your IP changes, set up <a href="https://www.duckdns.org" target="_blank" rel="noreferrer" className="text-primary underline">DuckDNS</a> or Cloudflare DDNS</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep('choose')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setStep('install')}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Continue <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 3: Install ── */}
            {step === 'install' && scenario && (
              <motion.div
                key="install"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Install &amp; Configure</h2>
                  <p className="text-muted-foreground text-sm">
                    Follow these steps on the machine running HomeStream.
                  </p>
                </div>

                <div className="flex flex-col gap-6">

                  {/* ── LAN scenario ── */}
                  {scenario === 'lan' && (
                    <>
                      <div className="flex gap-4">
                        <StepBadge n={1} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Install Caddy</h3>
                          <CodeBlock label="Terminal" code={`# macOS
brew install caddy

# Linux (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Windows — download from https://caddyserver.com/download`} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={2} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Create your Caddyfile</h3>
                          <CodeBlock label="Caddyfile" code={caddyfileLan} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={3} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Trust the local CA (one-time)</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Run this once so your browser trusts Caddy's self-signed cert without warnings.
                          </p>
                          <CodeBlock label="Terminal" code={trustCertCommands} />
                          <p className="text-xs text-muted-foreground mt-2">
                            On mobile devices, visit <code className="text-foreground">https://{ip}/api/health</code> and accept the certificate warning once.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={4} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Start Caddy</h3>
                          <CodeBlock label="Terminal" code={`# Start (and keep running in foreground)
caddy run

# Or start as a background service
sudo systemctl enable --now caddy   # Linux
brew services start caddy           # macOS`} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Domain scenario ── */}
                  {scenario === 'domain' && (
                    <>
                      <div className="flex gap-4">
                        <StepBadge n={1} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Install Caddy</h3>
                          <CodeBlock label="Terminal" code={`# macOS
brew install caddy

# Linux (Debian/Ubuntu)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy`} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={2} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Create your Caddyfile</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Caddy automatically obtains and renews your Let's Encrypt certificate — no certbot needed.
                          </p>
                          <CodeBlock label="Caddyfile" code={caddyfileDomain} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={3} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Start Caddy</h3>
                          <CodeBlock label="Terminal" code={`# Start Caddy (it will auto-obtain your cert on first run)
sudo caddy run --config /etc/caddy/Caddyfile

# Or as a service
sudo systemctl enable --now caddy`} />
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex gap-3">
                        <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">Dynamic IP?</p>
                          <p>If your ISP changes your public IP, your domain will stop working. Set up a free DDNS service like <a href="https://www.duckdns.org" target="_blank" rel="noreferrer" className="text-primary underline">DuckDNS</a> or use Cloudflare's free DNS with their API to auto-update your A record.</p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Cloudflare scenario ── */}
                  {scenario === 'cloudflare' && (
                    <>
                      <div className="p-4 rounded-xl bg-orange-500/5 border border-orange-500/20 flex gap-3">
                        <Info className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground">
                          <p className="font-medium text-foreground mb-1">Prerequisites</p>
                          <p>You need a free <a href="https://cloudflare.com" target="_blank" rel="noreferrer" className="text-primary underline">Cloudflare account</a> with your domain added. The free plan is sufficient — no credit card needed.</p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={1} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Install cloudflared</h3>
                          <CodeBlock label="Terminal" code={cloudflaredInstall} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={2} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">Create &amp; configure the tunnel</h3>
                          <CodeBlock label="Terminal" code={cloudflaredTunnel} />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <StepBadge n={3} active done={false} />
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground mb-2">No Caddy needed</h3>
                          <p className="text-sm text-muted-foreground">
                            Cloudflare Tunnel handles TLS termination at their edge — your HomeStream server stays on plain HTTP internally. No Caddyfile, no cert management, no open ports.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* What HTTPS unlocks */}
                  <div className="p-5 rounded-2xl bg-card border border-border">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      What HTTPS unlocks
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Chromecast casting', desc: 'Requires HTTPS origin' },
                        { label: 'PWA install prompt', desc: 'Add to home screen' },
                        { label: 'Remote streaming', desc: 'Stream outside home WiFi' },
                        { label: 'Jellyfin iOS/Android', desc: 'Native app support' },
                        { label: 'Service Workers', desc: 'Offline caching' },
                        { label: 'Secure cookies', desc: 'SameSite=Strict auth' },
                      ].map(item => (
                        <div key={item.label} className="flex items-start gap-2 text-xs">
                          <Check className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-foreground font-medium">{item.label}</p>
                            <p className="text-muted-foreground">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep('configure')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => setStep('verify')}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Test connection <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step 4: Verify ── */}
            {step === 'verify' && scenario && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-foreground mb-2">Verify your setup</h2>
                  <p className="text-muted-foreground text-sm">
                    Once Caddy is running, test that HTTPS is working correctly.
                  </p>
                </div>

                <div className="flex flex-col gap-5">
                  {/* Connection tester */}
                  <div className="p-6 rounded-2xl bg-card border border-border text-center">
                    <div className="mb-4">
                      {verifyResult === null && !verifying && (
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                          <Lock className="w-7 h-7 text-muted-foreground" />
                        </div>
                      )}
                      {verifying && (
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                          <Loader2 className="w-7 h-7 text-primary animate-spin" />
                        </div>
                      )}
                      {verifyResult === 'ok' && (
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                          <CheckCircle2 className="w-7 h-7 text-green-400" />
                        </div>
                      )}
                      {verifyResult === 'fail' && (
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
                          <AlertCircle className="w-7 h-7 text-red-400" />
                        </div>
                      )}

                      <p className="font-semibold text-foreground mb-1">
                        {verifyResult === null && !verifying && 'Ready to test'}
                        {verifying && 'Checking connection…'}
                        {verifyResult === 'ok' && 'HTTPS is working!'}
                        {verifyResult === 'fail' && 'Could not connect'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {verifyResult === null && !verifying && `Will try: https://${scenario === 'lan' ? ip : effectiveDomain}/api/health`}
                        {verifying && 'Attempting HTTPS connection to your server…'}
                        {verifyResult === 'ok' && 'Your HomeStream server is reachable over HTTPS.'}
                        {verifyResult === 'fail' && 'Caddy may not be running yet, or the cert is still being issued.'}
                      </p>
                    </div>

                    <button
                      onClick={verifyHttps}
                      disabled={verifying}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 mx-auto"
                    >
                      {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      {verifying ? 'Testing…' : 'Test HTTPS connection'}
                    </button>
                  </div>

                  {/* Troubleshooting */}
                  {verifyResult === 'fail' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-2xl bg-card border border-red-500/20"
                    >
                      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        Troubleshooting
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">1.</span> Make sure Caddy is running: <code className="text-foreground">caddy run</code></li>
                        <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">2.</span> Check Caddy logs for errors: <code className="text-foreground">journalctl -u caddy -f</code></li>
                        {scenario === 'domain' && <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">3.</span> Confirm ports 80 &amp; 443 are forwarded on your router</li>}
                        {scenario === 'domain' && <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">4.</span> DNS may take up to 24h to propagate — check with <code className="text-foreground">dig {effectiveDomain}</code></li>}
                        {scenario === 'lan' && <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">3.</span> Run <code className="text-foreground">caddy trust</code> to install the local CA cert</li>}
                        {scenario === 'cloudflare' && <li className="flex items-start gap-2"><span className="text-muted-foreground/50 mt-0.5">3.</span> Confirm the tunnel is running: <code className="text-foreground">cloudflared tunnel run homestream</code></li>}
                      </ul>
                    </motion.div>
                  )}

                  {/* Success — next steps */}
                  {verifyResult === 'ok' && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 rounded-2xl bg-green-500/5 border border-green-500/20"
                    >
                      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        You're all set! Next steps
                      </h3>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" /> Install the Jellyfin app on your phone and connect to <code className="text-foreground">https://{scenario === 'lan' ? ip : effectiveDomain}</code></li>
                        <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" /> Open HomeStream in your mobile browser and tap <strong className="text-foreground">Add to Home Screen</strong> to install as a PWA</li>
                        <li className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" /> Chromecast casting is now available from the player</li>
                      </ul>
                    </motion.div>
                  )}

                  {/* Quick reference */}
                  <div className="p-5 rounded-2xl bg-card border border-border">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-muted-foreground" />
                      Quick reference
                    </h3>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {[
                        { label: 'HomeStream (HTTP)', url: `http://${ip}:${port}` },
                        { label: 'HomeStream (HTTPS)', url: scenario === 'lan' ? `https://${ip}` : `https://${effectiveDomain}` },
                        { label: 'Jellyfin API base', url: scenario === 'lan' ? `https://${ip}` : `https://${effectiveDomain}` },
                        { label: 'Health check', url: scenario === 'lan' ? `https://${ip}/api/health` : `https://${effectiveDomain}/api/health` },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/50 last:border-0">
                          <span className="text-muted-foreground">{item.label}</span>
                          <div className="flex items-center gap-1.5">
                            <code className="text-foreground font-mono">{item.url}</code>
                            <a href={item.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setStep('install')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Done — go home <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
