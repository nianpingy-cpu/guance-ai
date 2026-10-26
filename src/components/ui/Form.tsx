import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('field', className)}>
      <label htmlFor={htmlFor} className="field-label">
        {label}
      </label>
      {children}
      {error ? <p className="error-text">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  size?: 'md' | 'sm';
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap items-center gap-1 rounded-[10px] border border-line bg-[#f7f9fb] p-1',
        size === 'sm' && 'p-0.5',
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[8px] font-semibold transition-colors duration-180',
              size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]',
              active
                ? 'bg-white text-ink shadow-[0_1px_3px_rgba(23,32,51,.1)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function InfoBanner({
  tone = 'neutral',
  title,
  children,
  action,
  className,
}: {
  tone?: 'neutral' | 'warning' | 'success' | 'danger' | 'brand';
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-[#f8fafc] text-muted',
    warning: 'border-[#f0dfbd] bg-[#fdf8ee] text-[#7b5718]',
    success: 'border-[#cfe9dc] bg-[#f2faf6] text-[#25634a]',
    danger: 'border-[#ecd0cd] bg-[#fcf5f4] text-[#8a3b36]',
    brand: 'border-[#d9e3ef] bg-[#f5f8fc] text-[#2b4b72]',
  };
  return (
    <div className={cn('rounded-[13px] border px-4 py-3', tones[tone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? <p className="text-[12px] font-bold">{title}</p> : null}
          <div className={cn('text-[12px] leading-5', Boolean(title) && 'mt-0.5')}>{children}</div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function SourceLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'text-[10px] font-medium uppercase tracking-[0.12em] text-faint',
        className,
      )}
    >
      {children}
    </p>
  );
}
