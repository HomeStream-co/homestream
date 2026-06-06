import { MessageSquarePlus } from 'lucide-react';

interface FeedbackButtonProps {
  className?: string;
  compact?: boolean;
}

export default function FeedbackButton({ className = '' }: FeedbackButtonProps) {
  return (
    <a
      href="mailto:feedback@homestream.local?subject=HomeStream%20Feedback"
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground text-xs font-medium transition-colors ${className}`}
    >
      <MessageSquarePlus className="w-3.5 h-3.5 flex-shrink-0" />
      Send Feedback
    </a>
  );
}
