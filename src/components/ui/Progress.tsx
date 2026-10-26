import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function ProgressBar({
  value,
  tone = 'data',
  label,
  className,
}: {
  value: number;
  tone?: 'data' | 'hero' | 'mint' | 'navy';
  label?: string;
  className?: string;
}) {
  const colors = {
    data: 'bg-data',
    hero: 'bg-hero',
    mint: 'bg-mint',
    navy: 'bg-brand',
  };
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[#edf1f5]', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-250 ease-out', colors[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      />
    </div>
  );
}

export function StageProgress({
  stages,
}: {
  stages: Array<{ label: string; value: number; hint: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stages.map((stage, index) => (
        <div key={stage.label}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
              <span
                className={cn(
                  'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold',
                  stage.value >= 100
                    ? 'bg-brand text-white'
                    : stage.value > 0
                      ? 'bg-[var(--accent-mint-soft)] text-[var(--accent-mint-ink)]'
                      : 'bg-[#f1f4f8] text-faint',
                )}
              >
                {stage.value >= 100 ? '✓' : index + 1}
              </span>
              {stage.label}
            </span>
            <span className="tabular text-[11px] text-faint">{stage.value}%</span>
          </div>
          <ProgressBar
            value={stage.value}
            tone={stage.value >= 100 ? 'navy' : stage.value > 0 ? 'mint' : 'data'}
            label={stage.label}
          />
          <p className="mt-1.5 truncate text-[11px] text-faint">{stage.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line bg-[#fbfcfd] px-5 text-center',
        compact ? 'py-7' : 'py-12',
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-faint">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[12px] leading-5 text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
