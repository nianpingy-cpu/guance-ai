import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

export function MetricCard({
  label,
  value,
  unit,
  note,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('metric-summary', className)}>
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className="kpi-number">{value}</span>
        {unit ? <span className="text-xs text-muted">{unit}</span> : null}
      </div>
      {note ? <p className="mt-3 text-xs leading-5 text-muted">{note}</p> : null}
    </div>
  );
}
