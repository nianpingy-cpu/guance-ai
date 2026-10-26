import { useCallback, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/format';

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function useChartTip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const showTip = useCallback((event: PointerEvent<SVGElement>, content: ReactNode) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      content,
    });
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  return { containerRef, tip, showTip, hideTip };
}

export function ChartFrame({
  title,
  subtitle,
  unit,
  source,
  action,
  legend,
  children,
  className,
  note,
}: {
  title: string;
  subtitle?: string;
  unit?: string;
  source: string;
  action?: ReactNode;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
  note?: ReactNode;
}) {
  return (
    <figure className={cn('card card-pad flex min-w-0 flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <figcaption className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-bold tracking-[-0.015em] text-ink">{title}</h3>
            {unit ? (
              <span className="text-[11px] font-medium text-faint">单位：{unit}</span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-[12px] leading-5 text-muted">{subtitle}</p> : null}
        </figcaption>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {legend ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">{legend}</div> : null}
      <div className="mt-3 min-w-0 flex-1">{children}</div>
      {note ? <div className="mt-2 text-[11px] leading-5 text-muted">{note}</div> : null}
      <p className="mt-3 border-t border-line pt-2.5 text-[9px] font-medium uppercase tracking-[0.11em] text-faint">
        {source}
      </p>
    </figure>
  );
}

export function LegendDot({
  color,
  label,
  shape = 'dot',
}: {
  color: string;
  label: string;
  shape?: 'dot' | 'pill' | 'line';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted">
      <span
        aria-hidden="true"
        className={cn(
          'inline-block',
          shape === 'dot' && 'h-2 w-2 rounded-full',
          shape === 'pill' && 'h-2 w-3.5 rounded-full',
          shape === 'line' && 'h-[2px] w-4 rounded-full',
        )}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
