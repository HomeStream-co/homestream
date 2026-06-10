import { useCallback } from 'react';
import { motion } from 'motion/react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, CornerDownLeft, ArrowLeft } from 'lucide-react';
function haptic(pattern: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

export default function DpadTab({ send }: { send: (cmd: Record<string, unknown>) => void }) {
  const sendCmd = useCallback((cmd: string) => {
    haptic(40);
    send({ type: cmd });
  }, [send]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 select-none touch-none px-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-white tracking-tight">TV Remote</h2>
        <p className="text-sm text-white/50">Navigate the HomeStream interface</p>
      </div>

      <div className="relative w-64 h-64 bg-white/5 rounded-full p-4 border border-white/10 shadow-2xl">
        {/* Up */}
        <button
          onClick={() => sendCmd('dpad_up')}
          className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-16 flex items-center justify-center text-white/70 hover:text-white active:bg-white/20 rounded-t-full transition-colors focus:outline-none"
        >
          <ChevronUp className="w-10 h-10" />
        </button>

        {/* Down */}
        <button
          onClick={() => sendCmd('dpad_down')}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-16 flex items-center justify-center text-white/70 hover:text-white active:bg-white/20 rounded-b-full transition-colors focus:outline-none"
        >
          <ChevronDown className="w-10 h-10" />
        </button>

        {/* Left */}
        <button
          onClick={() => sendCmd('dpad_left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-24 flex items-center justify-center text-white/70 hover:text-white active:bg-white/20 rounded-l-full transition-colors focus:outline-none"
        >
          <ChevronLeft className="w-10 h-10" />
        </button>

        {/* Right */}
        <button
          onClick={() => sendCmd('dpad_right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-24 flex items-center justify-center text-white/70 hover:text-white active:bg-white/20 rounded-r-full transition-colors focus:outline-none"
        >
          <ChevronRight className="w-10 h-10" />
        </button>

        {/* OK / Enter */}
        <button
          onClick={() => sendCmd('dpad_enter')}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center font-bold text-lg active:scale-95 transition-transform focus:outline-none"
        >
          OK
        </button>
      </div>

      <div className="flex gap-6 mt-4">
        <button
          onClick={() => sendCmd('dpad_back')}
          className="flex flex-col items-center justify-center w-20 h-20 bg-white/10 rounded-full text-white/70 hover:text-white active:bg-white/20 transition-colors focus:outline-none"
        >
          <ArrowLeft className="w-8 h-8 mb-1" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Back</span>
        </button>
      </div>
    </div>
  );
}
