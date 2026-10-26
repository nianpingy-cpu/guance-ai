import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function MetricCard({
  label,
  value,
  unit,
  note,
  badge,
  spark,
  tone = 'default',
  className,
  footer,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  badge?: ReactNode;
  spark?: ReactNode;
  tone?: 'default' | 'navy' | 'mint' | 'terracotta';
  className?: string;
  footer?: ReactNode;
}) {
  const accents = {
    default: 'border-line',
    navy: 'border-[#d8e2ef]',
    mint: 'border-[#d8eee3]',
    terracotta: 'border-[#ead8d3]',
  };
  const washes = {
    default: '',
    navy: 'bg-[linear-gradient(150deg,#ffffff_35%,#f5f8fc_100%)]',
    mint: 'bg-[linear-gradient(150deg,#ffffff_35%,#f3faf6_100%)]',
    terracotta: 'bg-[linear-gradient(150deg,#ffffff_35%,#fcf7f5_100%)]',
  };
  return (
    <div
      className={cn(
        'card flex min-h-[148px] flex-col justify-between overflow-hidden p-5 transition-shadow duration-180 hover:shadow-[0_16px_36px_-30px_rgba(23,32,51,.32)]',
        accents[tone],
        washes[tone],
        className,
      )}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-semibold text-muted">{label}</p>
          {badge}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-1.5">
          <span className="kpi-number text-ink">{value}</span>
          {unit ? <span className="text-[12px] font-medium text-muted">{unit}</span> : null}
        </div>
      </div>
      <div className="mt-3">
        {spark ? <div className="mb-2">{spark}</div> : null}
        {note ? <div className="text-[12px] leading-5 text-muted">{note}</div> : null}
        {footer}
      </div>
    </div>
  );
}
