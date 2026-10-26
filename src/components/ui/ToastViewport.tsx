import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { useToastStore } from '@/store/toast';
import { cn } from '@/lib/format';

const icons = {
  default: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  danger: XCircle,
};

export function ToastViewport() {
  const messages = useToastStore((state) => state.messages);
  const dismiss = useToastStore((state) => state.dismiss);
  return (
    <div
      className="fixed bottom-5 right-5 z-[90] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2 print-hide"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((message) => {
        const Icon = icons[message.tone];
        return (
          <div
            key={message.id}
            className={cn(
              'fade-up flex items-start gap-3 rounded-[13px] border bg-white px-4 py-3 shadow-[0_18px_44px_-22px_rgba(23,32,51,.4)]',
              message.tone === 'success' && 'border-[#cfe9dc]',
              message.tone === 'warning' && 'border-[#f0dfbd]',
              message.tone === 'danger' && 'border-[#ecd0cd]',
              message.tone === 'default' && 'border-line',
            )}
          >
            <Icon
              size={16}
              className={cn(
                'mt-0.5 shrink-0',
                message.tone === 'success' && 'text-success',
                message.tone === 'warning' && 'text-warning',
                message.tone === 'danger' && 'text-danger',
                message.tone === 'default' && 'text-brand',
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-ink">{message.title}</p>
              {message.description ? (
                <p className="mt-0.5 text-[11px] leading-[18px] text-muted">{message.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="text-faint hover:text-ink"
              onClick={() => dismiss(message.id)}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
