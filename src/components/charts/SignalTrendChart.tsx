import type { TrendPoint } from '@/lib/calculations';
import { formatDate } from '@/lib/format';
import { ChartFrame, LegendDot, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors, niceMax, axisTicks } from './chartTheme';

export function SignalTrendChart({
  points,
  onSelectDate,
  selectedDate,
  title = '近期市场信号变化',
  subtitle = '按捕获日期逐日记录；点击某一天可在情报页查看当日记录',
}: {
  points: TrendPoint[];
  onSelectDate?: (date: string) => void;
  selectedDate?: string;
  title?: string;
  subtitle?: string;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const W = 760;
  const H = 274;
  const left = 44;
  const right = 18;
  const top = 24;
  const bottom = 56;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(1, ...points.map((point) => point.total)), 4);
  const x = (index: number) =>
    points.length <= 1 ? left + plotW / 2 : left + (index / (points.length - 1)) * plotW;
  const y = (value: number) => top + plotH - (value / max) * plotH;
  const labelEvery = points.length > 24 ? 6 : 4;
  const rangeLabel =
    points.length > 0
      ? `${formatDate(points[0].date, true)} — ${formatDate(points[points.length - 1].date, true)}`
      : '无数据';

  return (
    <ChartFrame
      title={title}
      subtitle={`${subtitle} · 时间范围 ${rangeLabel}`}
      unit="条 / 日"
      source="LUPI · 发丝线逐日记录 · 观策AI 模拟情报库"
      legend={
        <>
          <LegendDot color={chartColors.data} label="每日情报总量" shape="dot" />
          <LegendDot color={chartColors.hero} label="含高优先级情报" shape="dot" />
          <span className="text-[12px] text-faint">点越大表示数量越多</span>
        </>
      }
      action={
        selectedDate ? (
          <span className="tag tag-brand">已选 {formatDate(selectedDate)}</span>
        ) : undefined
      }
    >
      <div ref={containerRef} className="relative w-full">
        {points.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            当前筛选下暂无时间序列数据
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            role="img"
            aria-label={`近期市场信号变化，共 ${points.length} 天，最高单日 ${Math.max(
              ...points.map((point) => point.total),
            )} 条`}
            onPointerLeave={hideTip}
          >
            {axisTicks(max, 4).map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={W - right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={chartColors.grid}
                  strokeWidth={tick === 0 ? 1 : 0.7}
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text
                  x={left - 10}
                  y={y(tick) + 3.5}
                  textAnchor="end"
                  fontSize="14"
                  fill={chartColors.faint}
                  className="tabular"
                >
                  {tick}
                </text>
              </g>
            ))}

            {points.map((point, index) => {
              const px = x(index);
              const py = y(point.total);
              const selected = selectedDate === point.date;
              const hasHigh = point.high > 0;
              return (
                <g
                  key={point.date}
                  role={onSelectDate ? 'button' : undefined}
                  tabIndex={onSelectDate ? 0 : undefined}
                  aria-label={`${formatDate(point.date)}，${point.total} 条情报，其中高优先级 ${point.high} 条`}
                  onClick={() => onSelectDate?.(point.date)}
                  onKeyDown={(event) => {
                    if (onSelectDate && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelectDate(point.date);
                    }
                  }}
                  onPointerMove={(event) =>
                    showTip(
                      event,
                      <>
                        <strong>{formatDate(point.date, true)}</strong>
                        <br />
                        情报 {point.total} 条 · 高优先级 {point.high} 条
                        {point.disputed > 0 ? ` · 有争议 ${point.disputed} 条` : ''}
                        {onSelectDate ? <><br /><span style={{ opacity: 0.7 }}>点击筛选当日情报</span></> : null}
                      </>,
                    )
                  }
                  className={onSelectDate ? 'cursor-pointer' : undefined}
                >
                  {selected ? (
                    <rect
                      x={px - plotW / Math.max(points.length, 2) / 2.2}
                      y={top - 8}
                      width={plotW / Math.max(points.length, 2) / 1.1}
                      height={plotH + 12}
                      rx={8}
                      fill="rgba(36,62,99,.06)"
                    />
                  ) : null}
                  <line
                    x1={px}
                    x2={px}
                    y1={top}
                    y2={top + plotH}
                    stroke={chartColors.track}
                    strokeWidth={0.65}
                    className="chart-fade"
                    style={{ animationDelay: `${index * 8}ms` }}
                  />
                  <line
                    x1={px}
                    x2={px}
                    y1={py}
                    y2={top + plotH}
                    stroke={hasHigh ? chartColors.hero : chartColors.data}
                    strokeWidth={hasHigh ? 1.8 : 1.25}
                    opacity={0.9}
                    className="chart-fade"
                    style={{ animationDelay: `${160 + index * 10}ms` }}
                  />
                  {hasHigh ? (
                    <circle
                      cx={px}
                      cy={py}
                      r={4.6 + Math.min(2.2, point.high * 0.9)}
                      fill="none"
                      stroke={chartColors.hero}
                      strokeWidth={1.2}
                      className="chart-dot-pop"
                      style={{ animationDelay: `${240 + index * 10}ms` }}
                    />
                  ) : null}
                  <circle
                    cx={px}
                    cy={py}
                    r={3 + Math.min(2.4, point.total * 0.55)}
                    fill={hasHigh ? chartColors.hero : selected ? chartColors.ink : chartColors.data}
                    stroke={chartColors.bg}
                    strokeWidth={1.4}
                    className="chart-dot-pop"
                    style={{ animationDelay: `${220 + index * 10}ms` }}
                  />
                  {selected ? (
                    <text
                      x={px}
                      y={py - 12}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="800"
                      fill={chartColors.ink}
                    >
                      {point.total}
                    </text>
                  ) : null}
                  {index % labelEvery === 0 || index === points.length - 1 ? (
                    <text
                      x={px}
                      y={H - 10}
                      textAnchor="middle"
                      fontSize="14"
                      fill={chartColors.muted}
                      className="tabular"
                    >
                      {point.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        )}
        <ChartTip tip={tip} />
      </div>
    </ChartFrame>
  );
}
