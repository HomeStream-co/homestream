/**
 * CastButton — DLNA cast stub.
 * Replace with full implementation when you send src/components/CastButton.tsx.
 */
interface Props {
  streamUrl: string;
  hlsUrl?: string;
  title: string;
}

export default function CastButton({ title }: Props) {
  return (
    <button
      title={`Cast "${title}" via DLNA`}
      className="text-white/50 hover:text-white transition-colors"
      onClick={() => alert('DLNA cast not yet configured.')}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 8.5A12.5 12.5 0 0 1 14.5 21" />
        <path d="M2 13.5A7.5 7.5 0 0 1 9.5 21" />
        <circle cx="2.5" cy="20.5" r="1.5" fill="currentColor" />
        <rect x="14" y="3" width="8" height="14" rx="1" />
        <path d="M14 21h8" />
        <path d="M18 17v4" />
      </svg>
    </button>
  );
}
