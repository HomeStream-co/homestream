import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Tv2, QrCode, Copy, Check, ExternalLink, Wifi, Globe, Smartphone } from 'lucide-react';


function StepCard({ number, title, description, children }: {
  number: number; title: string; description: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
          {number}
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SamsungTVPage() {
  const lanBaseUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port || '3001'}`;
  const [copied, setCopied] = useState(false);

  const tvUrl = `${lanBaseUrl}/tv`;
  const qrApiUrl = `/qr-codes/samsung-tv.png`;

  const copyUrl = async () => {
    await navigator.clipboard.writeText(tvUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <Helmet>
        <title>Watch on Samsung TV — HomeStream</title>
        <meta name="description" content="Set up HomeStream on your Samsung Smart TV." />
      </Helmet>

      <div className="pt-20 pb-16 px-4 sm:px-6 lg:px-10 max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Tv2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-heading text-foreground">Watch on Samsung TV</h1>
            <p className="text-xs text-muted-foreground">Stream HomeStream directly on your Smart TV</p>
          </div>
        </div>

        {/* URL card */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 mb-8">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Your HomeStream URL</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono text-foreground bg-background/50 px-3 py-2 rounded-xl border border-border truncate">
              {tvUrl}
            </code>
            <button
              onClick={copyUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/80 text-primary-foreground text-xs font-semibold transition-all flex-shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Your TV must be on the same WiFi network as your HomeStream server.
          </p>
        </div>

        {/* Setup methods */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-foreground mb-4">Setup Methods</h2>

          {/* Method 1: Samsung Internet */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Method 1 — Samsung Internet Browser</h3>
              <span className="text-[10px] bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full font-medium">Easiest</span>
            </div>
            <div className="flex flex-col gap-3">
              <StepCard number={1} title="Open Samsung Internet" description="On your Samsung TV remote, press the Home button and navigate to the Samsung Internet app." />
              <StepCard number={2} title="Navigate to HomeStream" description="Type the URL below in the address bar and press Enter.">
                <code className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">{tvUrl}</code>
              </StepCard>
              <StepCard number={3} title="Bookmark it" description="Press the star icon to bookmark HomeStream for quick access next time." />
            </div>
          </div>

          {/* Method 2: QR Code */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <QrCode className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Method 2 — QR Code (Phone → TV)</h3>
            </div>
            <div className="flex flex-col gap-3">
              <StepCard number={1} title="Scan the QR code" description="Use your phone camera to scan the QR code below. It will open HomeStream in your phone browser.">
                <div className="mt-2 w-32 h-32 bg-white rounded-xl flex items-center justify-center">
                  <img src={qrApiUrl} alt="QR code for HomeStream TV" className="w-28 h-28 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <QrCode className="w-16 h-16 text-black" />
                </div>
              </StepCard>
              <StepCard number={2} title="Cast from your phone" description="Once HomeStream is open on your phone, tap the Cast button in the player to send it to your TV." />
            </div>
          </div>

          {/* Method 3: Tizen app */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Smartphone className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Method 3 — Tizen Web App (Advanced)</h3>
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full font-medium">Dev mode required</span>
            </div>
            <div className="flex flex-col gap-3">
              <StepCard number={1} title="Enable Developer Mode" description="On your Samsung TV, go to Apps → press 1-2-3-4-5 on remote → enable Developer Mode → enter your PC's IP." />
              <StepCard number={2} title="Deploy via Tizen Studio" description="Use Samsung Tizen Studio to sideload the HomeStream Tizen app package (.wgt) to your TV.">
                <a href="https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                  <ExternalLink className="w-3 h-3" />
                  Tizen Studio download
                </a>
              </StepCard>
            </div>
          </div>
        </div>

        {/* Requirements */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            Requirements
          </h2>
          <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>Samsung Smart TV (2016 or newer recommended)</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>TV and HomeStream server on the same WiFi network</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>HomeStream server running and accessible on your LAN</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>For HLS streaming: H.264/AAC encoded content (use Transcode if needed)</li>
          </ul>
        </div>
      </div>
    </>
  );
}
