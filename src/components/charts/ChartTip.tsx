import type { TipState } from './ChartFrame';
import { createPortal } from 'react-dom';

export function ChartTip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return createPortal(
    <div
      className="chart-tip"
      style={{ position: 'fixed', zIndex: 80, left: Math.max(130, Math.min(window.innerWidth - 130, tip.x)), top: Math.max(90, tip.y) }}
      role="status"
      aria-live="off"
    >
      {tip.content}
    </div>, document.body
  );
}
