import type { TipState } from './ChartFrame';

export function ChartTip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div
      className="chart-tip"
      style={{ left: tip.x, top: tip.y }}
      role="status"
      aria-live="off"
    >
      {tip.content}
    </div>
  );
}
