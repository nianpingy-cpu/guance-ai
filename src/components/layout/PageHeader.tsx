import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-5 pb-6', className)}>
      <div className="min-w-0 max-w-4xl">
        {eyebrow ? <div className="eyebrow mb-2">{eyebrow}</div> : null}
        <h1 className="page-title text-ink">{title}</h1>
        {description ? (
          <p className="mt-2.5 max-w-3xl text-[13px] leading-6 text-muted">{description}</p>
        ) : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">{meta}</div> : null}
      </div>
      {actions ? <div className="print-hide flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
      <span className="text-faint">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e7d9c2] bg-[#fdf8ee] px-2.5 py-1 text-[12px] font-semibold text-[#8a5a12]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#b7791f]" />
      演示数据 · 非真实投放
    </span>
  );
}
