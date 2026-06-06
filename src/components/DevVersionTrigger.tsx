/**
 * DevVersionTrigger — lightweight hold-to-unlock version badge.
 * Extracted so DebugPanel can import it statically without pulling in DevDrawer.
 */

import { useState, useRef, useCallback } from 'react';

interface VersionTriggerProps {
  version: string;
  onUnlock: () => void;
}

export function DevVersionTrigger({ version, onUnlock }: VersionTriggerProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  const HOLD_MS = 2000;

  const startHold = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!('shiftKey' in e) || !e.shiftKey) return;
    setHolding(true);
    holdStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const pct = Math.min(elapsed / HOLD_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        clearInterval(timerRef.current!);
        setHolding(false);
        setProgress(0);
        onUnlock();
      }
    }, 16);
  }, [onUnlock]);

  const cancelHold = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setHolding(false);
    setProgress(0);
  }, []);

  return (
    <span
      className="relative cursor-pointer select-none"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold as unknown as React.TouchEventHandler}
      onTouchEnd={cancelHold}
      title="Shift+hold to open dev tools"
    >
      {holding && (
        <span
          className="absolute inset-0 rounded"
          style={{
            background: `conic-gradient(rgb(139 92 246) ${progress * 360}deg, transparent 0deg)`,
            opacity: 0.6,
            borderRadius: 3,
          }}
        />
      )}
      <span className={`relative text-xs font-mono px-1 rounded transition-colors ${holding ? 'text-violet-300' : 'text-muted-foreground hover:text-foreground'}`}>
        v{version}
      </span>
    </span>
  );
}
