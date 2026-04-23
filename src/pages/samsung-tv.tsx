/**
 * /samsung-tv — Samsung TV Browser Setup Guide
 *
 * Step-by-step guide for accessing HomeStream on a Samsung Smart TV:
 *   1. Find your HomeStream URL (fetches /api/network/info)
 *   2. Open the Samsung TV browser
 *   3. Navigate to HomeStream
 *   4. Add to Home Screen (bookmark)
 *   5. Optional: HTTPS setup for full PWA features
 *   6. Remote control tips
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tv2, Wifi, Globe, Star, ChevronRight, ChevronLeft,
  Copy, Check, ArrowLeft, Info, Zap, MonitorSmartphone,
  TriangleAlert, CheckCircle2, Keyboard, Home,
  Play, Circle,
  ExternalLink, Lock, Smartphone, RefreshCw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NetworkInfo {
  hostname: string;
  lanIPs: string[];
  primary: string;
  port: number;
}

type GuideSection = 'overview' | 'browser' | 'navigate' | 'bookmark' | 'remote' | 'tips';

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


// ── Section components ────────────────────────────────────────────────────────

// Samsung remote key visual
function RemoteKey({ label, icon: Icon, color = 'bg-card border-border text-foreground' }: {
  label: string;
  icon?: React.ElementType;
  color?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${color} shadow-sm`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </div>
  );
}

// Info / warning callout
function Callout({ type, children }: { type: 'info' | 'warning' | 'success' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info:    { bg: 'bg-blue-500/10 border-blue-500/30',    icon: Info,          iconColor: 'text-blue-400',   label: 'Note' },
    warning: { bg: 'bg-yellow-500/10 border-yellow-500/30', icon: TriangleAlert, iconColor: 'text-yellow-400', label: 'Important' },
    success: { bg: 'bg-green-500/10 border-green-500/30',  icon: CheckCircle2,  iconColor: 'text-green-400',  label: 'Good to know' },
    tip:     { bg: 'bg-purple-500/10 border-purple-500/30', icon: Zap,           iconColor: 'text-purple-400', label: 'Tip' },
  }[type];
  const { bg, icon: Icon, iconColor, label } = styles;
  return (
    <div className={`flex gap-3 p-4 rounded-xl border ${bg}`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
      <div className="text-sm text-foreground/90 leading-relaxed">
        <span className={`font-semibold ${iconColor}`}>{label}: </span>
        {children}
      </div>
    </div>
  );
}

// ── Section nav config ─────────────────────────────────────────────────────────

const SECTIONS: { id: GuideSection; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: 'overview',  label: 'Overview',         icon: Tv2,            shortLabel: 'Overview'  },
  { id: 'browser',   label: 'Open Browser',     icon: Globe,          shortLabel: 'Browser'   },
  { id: 'navigate',  label: 'Go to HomeStream', icon: Wifi,           shortLabel: 'Navigate'  },
  { id: 'bookmark',  label: 'Add to Home',      icon: Star,           shortLabel: 'Bookmark'  },
  { id: 'remote',    label: 'Remote Tips',      icon: Keyboard,       shortLabel: 'Remote'    },
  { id: 'tips',      label: 'Troubleshooting',  icon: TriangleAlert,  shortLabel: 'Tips'      },
];

// ── Section content components ─────────────────────────────────────────────────

function OverviewSection({ networkInfo, netLoading }: { networkInfo: NetworkInfo | null; netLoading: boolean }) {
  const url = networkInfo
    ? `http://${networkInfo.primary}:${networkInfo.port}`
    : 'http://192.168.1.100:3000';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Samsung TV Setup</h2>
        <p className="text-muted-foreground leading-relaxed">
          Samsung Smart TVs (2016 and newer) include a built-in web browser that can access HomeStream
          directly on your local network — no app store, no sideloading required.
        </p>
      </div>

      {/* What you'll need */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          What you need
        </h3>
        <ul className="space-y-2.5">
          {[
            'Samsung Smart TV (2016 or newer — Tizen OS)',
            'TV and HomeStream server on the same WiFi network',
            'HomeStream running and accessible from your PC',
            'Your HomeStream local IP address (shown below)',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
              <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Your HomeStream URL */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Wifi className="w-4 h-4 text-primary" />
          Your HomeStream URL
        </h3>
        {netLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Detecting your local IP…
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Type this address into your Samsung TV browser:
            </p>
            <CodeBlock code={url} />
            {networkInfo && networkInfo.lanIPs.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Other IPs on this machine: {networkInfo.lanIPs.filter(ip => ip !== networkInfo.primary).join(', ')}
              </p>
            )}
          </>
        )}
      </div>

      <Callout type="tip">
        If your TV can't reach HomeStream, make sure both devices are on the same WiFi network
        (not guest network vs. main network). You can verify by pinging the IP from another device.
      </Callout>

      {/* Compatibility */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="font-semibold text-foreground">TV Compatibility</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: '2016–2024 Samsung (Tizen)', status: 'full', note: 'Full support' },
            { label: 'Samsung Frame / QLED / Neo QLED', status: 'full', note: 'Full support' },
            { label: 'Older Samsung (pre-2016)', status: 'partial', note: 'May work, limited' },
            { label: 'Samsung with Orsay OS (pre-2015)', status: 'none', note: 'Not supported' },
          ].map(({ label, status, note }) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === 'full' ? 'bg-green-400' : status === 'partial' ? 'bg-yellow-400' : 'bg-red-400'
              }`} />
              <div>
                <div className="text-foreground font-medium">{label}</div>
                <div className="text-muted-foreground text-xs">{note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowserSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Open the Samsung Browser</h2>
        <p className="text-muted-foreground leading-relaxed">
          Samsung Smart TVs have a built-in Internet browser app. Here's how to find and open it.
        </p>
      </div>

      {/* Method 1 — Smart Hub */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
          <h3 className="font-semibold text-foreground">Via Smart Hub (Recommended)</h3>
        </div>
        <ol className="space-y-3">
          {[
            { step: 'Press the Home button on your remote', key: 'Home', keyIcon: Home },
            { step: 'Navigate to "Apps" in the Smart Hub menu', key: null },
            { step: 'Search for "Internet" in the search bar', key: null },
            { step: 'Select the Internet app and press Enter/OK', key: 'Enter', keyIcon: Circle },
          ].map(({ step, key, keyIcon }, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="flex-1">{step}</span>
              {key && keyIcon && <RemoteKey label={key} icon={keyIcon} />}
            </li>
          ))}
        </ol>
      </div>

      {/* Method 2 — Direct shortcut */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">2</div>
          <h3 className="font-semibold text-foreground">Shortcut (2019+ TVs)</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          On newer Samsung TVs, you can access the browser faster:
        </p>
        <ol className="space-y-3">
          {[
            'Press the Home button',
            'Look for the Internet icon directly on the home bar (bottom row)',
            'Select it and press Enter/OK',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <Callout type="info">
        The browser app is called <strong>"Internet"</strong> on Samsung TVs — not "Browser" or "Chrome".
        If you don't see it, it may need to be installed from the Samsung App Store (it's free).
      </Callout>

      {/* Install from App Store */}
      <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-yellow-400" />
          If "Internet" isn't installed
        </h3>
        <ol className="space-y-2 text-sm text-foreground/80">
          {[
            'Press Home → go to "Apps"',
            'Press the Search (magnifying glass) icon',
            'Type "Internet" and select the Samsung Internet app',
            'Press "Install" — it\'s free',
            'Once installed, open it from Apps',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-4 h-4 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function NavigateSection({ networkInfo, netLoading }: { networkInfo: NetworkInfo | null; netLoading: boolean }) {
  const url = networkInfo
    ? `http://${networkInfo.primary}:${networkInfo.port}`
    : 'http://192.168.1.100:3000';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Navigate to HomeStream</h2>
        <p className="text-muted-foreground leading-relaxed">
          Once the Samsung Internet browser is open, type your HomeStream address into the URL bar.
        </p>
      </div>

      {/* URL to type */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground">Your HomeStream address</h3>
        {netLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Detecting…
          </div>
        ) : (
          <CodeBlock code={url} label="Type this in the TV browser address bar" />
        )}
        <p className="text-xs text-muted-foreground">
          Copy this on your phone or write it down — you'll need to type it on the TV remote.
        </p>
      </div>

      {/* Step by step */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Step by step</h3>
        <ol className="space-y-4">
          {[
            {
              step: 'Click the address bar at the top of the browser',
              detail: 'Navigate up using the D-pad until the address bar is highlighted, then press Enter/OK',
            },
            {
              step: 'A keyboard will appear on screen',
              detail: 'Use the D-pad to navigate the on-screen keyboard, or use a USB/Bluetooth keyboard for faster typing',
            },
            {
              step: `Type the address: ${url}`,
              detail: 'Make sure to include "http://" — the TV browser may not auto-add it',
            },
            {
              step: 'Press Enter or select "Go" on the keyboard',
              detail: 'HomeStream should load within a few seconds',
            },
          ].map(({ step, detail }, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-foreground">{step}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <Callout type="tip">
        <strong>Faster typing:</strong> Connect a USB keyboard to your Samsung TV's USB port.
        It works immediately — no setup needed. This makes typing the URL and logging in much easier.
      </Callout>

      {/* What you'll see */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="font-semibold text-foreground">What you'll see</h3>
        <div className="space-y-2.5">
          {[
            { label: 'Profiles page', desc: 'Select your profile to continue', icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Login page', desc: 'Enter your HomeStream password', icon: Lock, color: 'text-blue-400' },
            { label: 'Setup wizard', desc: 'Only if setup isn\'t complete yet', icon: Info, color: 'text-yellow-400' },
          ].map(({ label, desc, icon: Icon, color }) => (
            <div key={label} className="flex items-start gap-3 text-sm">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
              <div>
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-muted-foreground"> — {desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Callout type="warning">
        If you see a <strong>"Connection refused"</strong> error, HomeStream may not be running on your PC,
        or the IP address has changed. Check that HomeStream is running and verify the IP in your PC's
        network settings.
      </Callout>
    </div>
  );
}

function BookmarkSection({ networkInfo }: { networkInfo: NetworkInfo | null }) {
  const url = networkInfo
    ? `http://${networkInfo.primary}:${networkInfo.port}`
    : 'http://192.168.1.100:3000';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Add to Home Screen</h2>
        <p className="text-muted-foreground leading-relaxed">
          Save HomeStream as a bookmark or add it to your Samsung TV's home screen so you can
          launch it with one click — no typing the URL every time.
        </p>
      </div>

      {/* Bookmark method */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
          <h3 className="font-semibold text-foreground">Bookmark in the Browser</h3>
        </div>
        <ol className="space-y-3">
          {[
            `Navigate to ${url} in the Samsung Internet browser`,
            'Press the Menu button on your remote (☰ or the three-line button)',
            'Select "Bookmarks" → "Add to Bookmarks"',
            'Name it "HomeStream" and confirm',
            'Next time: open the browser → Bookmarks → HomeStream',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Add to Home Screen */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">2</div>
          <h3 className="font-semibold text-foreground">Add to Samsung TV Home Screen</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          You can pin a web shortcut directly to the Samsung Smart Hub home screen:
        </p>
        <ol className="space-y-3">
          {[
            `Open the browser and navigate to ${url}`,
            'Press the Menu button (☰) on your remote',
            'Select "Add to Home" or "Add Shortcut to Home"',
            'Confirm — a HomeStream tile will appear on your Smart Hub',
            'Press Home → find the HomeStream tile and launch it directly',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
              <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <Callout type="success">
        Once bookmarked, launching HomeStream on your TV takes just 2 button presses:
        <strong> Home → HomeStream tile</strong>. It opens directly to the profiles page.
      </Callout>

      {/* HTTPS upgrade note */}
      <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-400" />
          Optional: Upgrade to HTTPS for PWA features
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The basic HTTP setup works great for watching. If you want the full PWA experience
          (offline support, better performance, no "Not Secure" warnings), set up HTTPS using
          the guide in HomeStream settings.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-purple-400 font-medium">Settings → HTTPS Setup</span>
          <span className="text-muted-foreground">in HomeStream</span>
        </div>
      </div>
    </div>
  );
}

function RemoteSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Remote Control Tips</h2>
        <p className="text-muted-foreground leading-relaxed">
          Navigating HomeStream with a Samsung TV remote is straightforward once you know the key mappings.
          Here's everything you need to know.
        </p>
      </div>

      {/* D-pad navigation */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Keyboard className="w-4 h-4 text-primary" />
          D-Pad Navigation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { keys: ['↑', '↓', '←', '→'], action: 'Navigate between items, cards, and buttons' },
            { keys: ['Enter / OK'], action: 'Select / click the focused element' },
            { keys: ['Back / Return'], action: 'Go back (browser back button)' },
            { keys: ['Home'], action: 'Return to Samsung Smart Hub' },
            { keys: ['Exit'], action: 'Close the browser entirely' },
          ].map(({ keys, action }) => (
            <div key={action} className="flex items-start gap-3 text-sm">
              <div className="flex gap-1 flex-wrap flex-shrink-0">
                {keys.map(k => (
                  <RemoteKey key={k} label={k} />
                ))}
              </div>
              <span className="text-muted-foreground mt-1">{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Player controls */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          Video Player Controls
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { keys: ['Enter / OK'], action: 'Play / Pause' },
            { keys: ['←', '→'], action: 'Seek backward / forward 10s' },
            { keys: ['↑', '↓'], action: 'Volume up / down' },
            { keys: ['Back'], action: 'Exit player, return to show/movie page' },
            { keys: ['Play ▶'], action: 'Resume playback' },
            { keys: ['Pause ⏸'], action: 'Pause playback' },
          ].map(({ keys, action }) => (
            <div key={action} className="flex items-start gap-3 text-sm">
              <div className="flex gap-1 flex-wrap flex-shrink-0">
                {keys.map(k => (
                  <RemoteKey key={k} label={k} />
                ))}
              </div>
              <span className="text-muted-foreground mt-1">{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phone remote */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          Use the HomeStream Phone Remote
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          HomeStream includes a built-in phone remote at <code className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs">/remote</code>.
          Open it on your phone while HomeStream is playing on the TV for a much better experience:
        </p>
        <ul className="space-y-2 text-sm text-foreground/80">
          {[
            'Full touch-based playback controls (play, pause, seek)',
            'Volume control',
            'Browse and queue next content from your phone',
            'No typing on the TV remote needed',
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <div className="pt-1 text-xs text-muted-foreground">
          Scan the QR code on the HomeStream home page, or open{' '}
          <span className="text-primary font-mono">http://[your-ip]:3000/remote</span> on your phone.
        </div>
      </div>

      <Callout type="tip">
        <strong>USB keyboard:</strong> Plug any USB keyboard into your Samsung TV's USB port for
        fast text input — great for searching, typing passwords, and navigating. No drivers needed.
      </Callout>
    </div>
  );
}

function TipsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Troubleshooting</h2>
        <p className="text-muted-foreground leading-relaxed">
          Common issues and how to fix them when using HomeStream on a Samsung TV.
        </p>
      </div>

      {/* Issues list */}
      {[
        {
          problem: 'Page won\'t load / "Connection refused"',
          solutions: [
            'Make sure HomeStream is running on your PC (check the system tray icon)',
            'Verify the IP address — your PC\'s IP may have changed. Check Settings → Network on your PC',
            'Confirm both TV and PC are on the same WiFi network (not guest vs. main)',
            'Try pinging the IP from another device on the network',
            'Check Windows Firewall — allow HomeStream through on port 3000',
            'Norton VPN users: Norton\'s Smart Firewall can block LAN traffic when the VPN is active. Open Norton → Settings → Firewall → Traffic Rules and add an Allow rule for 192.168.0.0/24 (your local network). Your HomeStream IP never changes when the VPN is on — only your public internet IP changes.',
          ],
          severity: 'warning' as const,
        },
        {
          problem: 'Video won\'t play / black screen',
          solutions: [
            'The Samsung TV browser supports H.264 video — HomeStream transcodes automatically',
            'Wait a few seconds for transcoding to start on the first play',
            'Try a different quality setting in the player (lower quality = faster start)',
            'Check the Downloads page to ensure FFmpeg is working',
            'Reload the page and try again',
          ],
          severity: 'warning' as const,
        },
        {
          problem: 'Page looks wrong / layout broken',
          solutions: [
            'The Samsung Internet browser may be in mobile mode — switch to desktop mode',
            'In the browser menu (☰), look for "Desktop View" or "Request Desktop Site"',
            'HomeStream is designed for desktop/TV viewport — desktop mode is required',
            'Try zooming out if content appears too large',
          ],
          severity: 'info' as const,
        },
        {
          problem: 'Subtitles / captions not showing',
          solutions: [
            'Open the player controls and look for the CC / Subtitles button',
            'Samsung TV browser supports WebVTT subtitles — make sure captions are enabled in HomeStream',
            'If subtitles are burned-in (hardcoded), they\'ll always show regardless',
          ],
          severity: 'info' as const,
        },
        {
          problem: 'Slow performance / laggy UI',
          solutions: [
            'The Samsung TV browser is less powerful than a PC browser — this is normal',
            'Avoid having many browser tabs open',
            'Close other apps running on the TV',
            'Lower the streaming quality in the player settings',
            'Consider using a Chromecast or Fire Stick for better performance',
          ],
          severity: 'info' as const,
        },
        {
          problem: 'Logged out every time / session not saved',
          solutions: [
            'Enable cookies in the Samsung Internet browser settings',
            'Go to browser Settings → Privacy → make sure cookies are allowed',
            'Don\'t use Incognito/Private mode — sessions won\'t persist',
          ],
          severity: 'info' as const,
        },
      ].map(({ problem, solutions, severity }) => (
        <div key={problem} className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
          <h3 className="font-semibold text-foreground flex items-start gap-2">
            <TriangleAlert className={`w-4 h-4 mt-0.5 flex-shrink-0 ${severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`} />
            {problem}
          </h3>
          <ul className="space-y-2">
            {solutions.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Norton VPN callout */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-orange-400" />
          Using Norton VPN? Read This First
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Norton's Smart Firewall can block local network (LAN) traffic when the VPN is active,
          preventing your TV from reaching HomeStream even though the server is running fine.
          Your HomeStream IP address (<strong className="text-foreground">192.168.0.20</strong>) never
          changes when Norton VPN is on — only your public internet IP changes. The fix is to whitelist
          your local network in Norton's firewall:
        </p>
        <ol className="space-y-2 text-sm text-foreground/80">
          {[
            'Open Norton Security on your PC',
            'Go to Settings → Firewall → Traffic Rules',
            'Click "Add" to create a new rule',
            'Set Action: Allow, Direction: Both',
            'Set Local IP range: 192.168.0.0 – 192.168.0.255',
            'Save the rule — your TV can now reach HomeStream while Norton VPN is active',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="w-4 h-4 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground pt-1">
          Note: This only allows LAN traffic — all internet traffic still routes through the VPN as normal.
          Your downloads remain protected.
        </p>
      </div>

      {/* Alternative devices */}
      <div className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4 text-primary" />
          Alternative Devices (Better Performance)
        </h3>
        <p className="text-sm text-muted-foreground">
          If the Samsung TV browser feels slow, these devices give a much better HomeStream experience:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { device: 'Chromecast with Google TV', note: 'Chrome browser, excellent performance' },
            { device: 'Amazon Fire TV Stick 4K', note: 'Silk browser, good performance' },
            { device: 'Apple TV 4K', note: 'Safari browser, smooth playback' },
            { device: 'NVIDIA Shield', note: 'Chrome browser, best performance' },
            { device: 'Raspberry Pi 4 + Chromium', note: 'Full desktop browser, very capable' },
            { device: 'Mini PC (Intel NUC etc.)', note: 'Full PC browser, perfect experience' },
          ].map(({ device, note }) => (
            <div key={device} className="flex items-start gap-2.5 text-sm">
              <Check className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-foreground">{device}</div>
                <div className="text-muted-foreground text-xs">{note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SamsungTvPage() {
  const navigate = useNavigate();
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [netLoading, setNetLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<GuideSection>('overview');

  useEffect(() => {
    fetch('/api/network/info')
      .then(r => r.ok ? r.json() as Promise<NetworkInfo> : Promise.reject())
      .then(info => setNetworkInfo(info))
      .catch(() => setNetworkInfo({ hostname: 'homestream', lanIPs: [], primary: '192.168.1.100', port: 3000 }))
      .finally(() => setNetLoading(false));
  }, []);

  const currentIndex = SECTIONS.findIndex(s => s.id === activeSection);
  const prevSection = currentIndex > 0 ? SECTIONS[currentIndex - 1] : null;
  const nextSection = currentIndex < SECTIONS.length - 1 ? SECTIONS[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Tv2 className="w-5 h-5 text-primary flex-shrink-0" />
            <h1 className="text-base font-semibold text-foreground truncate">Samsung TV Setup Guide</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex gap-8">

          {/* Sidebar nav — desktop */}
          <aside className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-24 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-3">
                Guide Sections
              </p>
              {SECTIONS.map((section, i) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                const isDone = SECTIONS.findIndex(s => s.id === activeSection) > i;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isDone ? 'bg-green-500' : isActive ? 'bg-primary' : 'bg-muted'
                    }`}>
                      {isDone
                        ? <Check className="w-3 h-3 text-white" />
                        : <Icon className={`w-3 h-3 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                      }
                    </div>
                    {section.label}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Mobile section tabs */}
            <div className="lg:hidden mb-6 overflow-x-auto">
              <div className="flex gap-2 pb-2">
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {section.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {activeSection === 'overview'  && <OverviewSection networkInfo={networkInfo} netLoading={netLoading} />}
                {activeSection === 'browser'   && <BrowserSection />}
                {activeSection === 'navigate'  && <NavigateSection networkInfo={networkInfo} netLoading={netLoading} />}
                {activeSection === 'bookmark'  && <BookmarkSection networkInfo={networkInfo} />}
                {activeSection === 'remote'    && <RemoteSection />}
                {activeSection === 'tips'      && <TipsSection />}
              </motion.div>
            </AnimatePresence>

            {/* Prev / Next navigation */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-border">
              {prevSection ? (
                <button
                  onClick={() => setActiveSection(prevSection.id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {prevSection.label}
                </button>
              ) : <div />}

              {nextSection ? (
                <button
                  onClick={() => setActiveSection(nextSection.id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  {nextSection.label}
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Done — Go to HomeStream
                </button>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
