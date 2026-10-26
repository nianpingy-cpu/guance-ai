import { chartColors } from './chartTheme';

export function SparkBars({
  values,
  tone = 'data',
  width = 150,
  height = 30,
  label,
}: {
  values: number[];
  tone?: 'data' | 'hero' | 'mint';
  width?: number;
  height?: number;
  label?: string;
}) {
  const max = Math.max(1, ...values);
  const color =
    tone === 'hero' ? chartColors.hero : tone === 'mint' ? chartColors.mint : chartColors.data;
  const barWidth = values.length > 0 ? Math.max(2, (width - values.length * 2) / values.length) : 2;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="block h-[30px]"
      role="img"
      aria-label={label ?? '迷你趋势图'}
    >
      {values.map((value, index) => {
        const h = value === 0 ? 2 : Math.max(3, (value / max) * (height - 2));
        return (
          <rect
            key={`${index}-${value}`}
            x={index * (barWidth + 2)}
            y={height - h}
            width={barWidth}
            height={h}
            rx={barWidth / 2}
            fill={color}
            opacity={index === values.length - 1 ? 1 : 0.38 + (value / max) * 0.4}
          />
        );
      })}
    </svg>
  );
}

export function SparkLine({
  values,
  tone = 'data',
  width = 150,
  height = 32,
}: {
  values: number[];
  tone?: 'data' | 'hero';
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((value - min) / span) * (height - 10);
    return [x, y] as const;
  });
  const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const color = tone === 'hero' ? chartColors.hero : chartColors.data;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="block h-[32px]" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" opacity={0.8} />
      {points.length > 0 ? (
        <circle
          cx={points[points.length - 1][0]}
          cy={points[points.length - 1][1]}
          r={2.4}
          fill={color}
        />
      ) : null}
    </svg>
  );
}
