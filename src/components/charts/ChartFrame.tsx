import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/format';
import { useAppStore } from '@/store/appStore';

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function useChartTip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const showTip = useCallback((event: PointerEvent<SVGElement>, content: ReactNode) => {
    setTip({
      x: event.clientX,
      y: event.clientY,
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
  const real = useAppStore((s) => s.mode === 'real');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => { const el = scrollRef.current; if (!el) return; const update = () => setScrollable(el.scrollWidth > el.clientWidth + 1); const observer = new window.ResizeObserver(update); observer.observe(el); update(); return () => observer.disconnect(); }, [children]);
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
      {scrollable && <p className="mt-2 text-xs text-muted">图表内可左右滚动，点击数据查看完整依据。</p>}
      <div ref={scrollRef} className="chart-scroll mt-3 min-w-0 flex-1" tabIndex={0} aria-label={`${title}，可横向滚动查看`}>{children}</div>
      {note ? <div className="mt-2 text-[11px] leading-5 text-muted">{note}</div> : null}
      <p className="mt-3 border-t border-line pt-2.5 text-[11px] font-medium uppercase tracking-[0.11em] text-faint">
        {real ? source.replace('模拟情报库', '当前项目情报库').replace('模拟', '项目') : source}
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
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted">
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
