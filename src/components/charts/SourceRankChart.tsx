import { formatPercent } from '@/lib/format';
import { ChartFrame, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors, niceMax } from './chartTheme';

export function SourceRankChart({
  data,
  total,
  selectedPlatform,
  onSelectPlatform,
}: {
  data: Array<{ platform: string; count: number }>;
  total: number;
  selectedPlatform?: string;
  onSelectPlatform?: (platform: string) => void;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const rows = data.slice(0, 9);
  const W = 500;
  const rowH = 32;
  const top = 16;
  const left = 94;
  const right = 46;
  const H = Math.max(150, top + rows.length * rowH + 16);
  const plotW = W - left - right;
  const max = niceMax(Math.max(1, ...rows.map((row) => row.count)), 4);
  const barW = (count: number) => (count / max) * plotW;

  return (
    <ChartFrame
      title="来源平台分布"
      subtitle="当前筛选结果的来源构成；点击平台可继续筛选"
      unit="条"
      source="GLANCE · 排序对比 · 模拟来源库"
    >
      <div ref={containerRef} className="relative w-full">
        {rows.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            暂无来源分布数据
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            role="img"
            aria-label={`来源平台分布，共 ${rows.length} 个平台`}
            onPointerLeave={hideTip}
          >
            {rows.map((row, index) => {
              const y = top + index * rowH;
              const active = selectedPlatform === row.platform;
              const width = Math.max(3, barW(row.count));
              return (
                <g
                  key={row.platform}
                  role={onSelectPlatform ? 'button' : undefined}
                  tabIndex={onSelectPlatform ? 0 : undefined}
                  aria-label={`${row.platform}，${row.count} 条，占 ${formatPercent(
                    total ? row.count / total : null,
                    0,
                  )}`}
                  onClick={() => onSelectPlatform?.(row.platform)}
                  onKeyDown={(event) => {
                    if (onSelectPlatform && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelectPlatform(row.platform);
                    }
                  }}
                  onPointerMove={(event) =>
                    showTip(
                      event,
                      <>
                        <strong>{row.platform}</strong>
                        <br />
                        {row.count} 条 · 占 {formatPercent(total ? row.count / total : null, 0)}
                        {onSelectPlatform ? <><br /><span style={{ opacity: 0.7 }}>点击筛选来源</span></> : null}
                      </>,
                    )
                  }
                  className={onSelectPlatform ? 'cursor-pointer' : undefined}
                >
                  {active ? (
                    <rect
                      x={0}
                      y={y - 6}
                      width={W}
                      height={rowH - 2}
                      rx={8}
                      fill="rgba(36,62,99,.05)"
                    />
                  ) : null}
                  <text
                    x={left - 10}
                    y={y + 13}
                    textAnchor="end"
                    fontSize="14"
                    fontWeight={active ? 700 : 500}
                    fill={active ? chartColors.ink : chartColors.muted}
                  >
                    {row.platform}
                  </text>
                  <rect
                    x={left}
                    y={y + 3}
                    width={plotW}
                    height={11}
                    rx={5.5}
                    fill={chartColors.track}
                  />
                  <rect
                    x={left}
                    y={y + 3}
                    width={width}
                    height={11}
                    rx={5.5}
                    fill={index === 0 ? chartColors.data : active ? chartColors.hero : chartColors.dataSecondary}
                    opacity={index === 0 ? 1 : 0.72}
                    className="chart-bar-pop"
                    style={{ animationDelay: `${index * 55}ms`, transformOrigin: `${left}px ${y}px` }}
                  />
                  <text
                    x={W - right + 8}
                    y={y + 13}
                    fontSize="14"
                    fontWeight="800"
                    fill={chartColors.ink}
                    className="tabular"
                  >
                    {row.count}
                  </text>
                  <text
                    x={W - 5}
                    y={y + 13}
                    textAnchor="end"
                    fontSize="14"
                    fill={chartColors.faint}
                    className="tabular"
                  >
                    {total ? `${Math.round((row.count / total) * 100)}%` : '—'}
                  </text>
                </g>
              );
            })}
            <line
              x1={left}
              x2={W - right}
              y1={H - 7}
              y2={H - 7}
              stroke={chartColors.grid}
              strokeWidth={0.8}
            />
          </svg>
        )}
        <ChartTip tip={tip} />
      </div>
    </ChartFrame>
  );
}
