import type { InsightTheme } from '@/types/domain';
import { ChartFrame, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors, niceMax } from './chartTheme';

export function ThemeRankChart({
  themes,
  selectedThemeId,
  onSelectTheme,
  periodLabel,
}: {
  themes: InsightTheme[];
  selectedThemeId: string;
  onSelectTheme: (id: string) => void;
  periodLabel?: string;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const sorted = [...themes].sort((a, b) => a.rank - b.rank);
  const W = 660;
  const rowH = 54;
  const top = 22;
  const H = top + sorted.length * rowH + 16;
  const barLeft = 226;
  const barRight = 54;
  const plotW = W - barLeft - barRight;
  const max = niceMax(Math.max(1, ...sorted.map((theme) => theme.mentionCount)), 4);

  return (
    <ChartFrame
      title="消费者关注主题排序"
      subtitle={`按可追溯证据的提及强度排序；点击主题查看对应证据${periodLabel ? ` · 证据期 ${periodLabel}` : ''}`}
      unit="条提及"
      source="GLANCE · 排序对比 · 模拟消费者信号"
      legend={
        <span className="text-[10px] text-faint">
          排名与数值同时呈现；深灰绿为已选主题，陶土仅用于当前最高关注项
        </span>
      }
    >
      <div ref={containerRef} className="relative w-full">
        {sorted.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            暂无关注主题数据
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            role="img"
            aria-label={`消费者关注主题排序，共 ${sorted.length} 个主题`}
            onPointerLeave={hideTip}
          >
            {sorted.map((theme, index) => {
              const y = top + index * rowH;
              const active = selectedThemeId === theme.id;
              const width = Math.max(8, (theme.mentionCount / max) * plotW);
              return (
                <g
                  key={theme.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${theme.title}，${theme.mentionCount} 条提及，置信度 ${theme.confidence}`}
                  onClick={() => onSelectTheme(theme.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectTheme(theme.id);
                    }
                  }}
                  onPointerMove={(event) =>
                    showTip(
                      event,
                      <>
                        <strong>
                          {theme.rank}. {theme.title}
                        </strong>
                        <br />
                        {theme.mentionCount} 条提及 · 置信度{' '}
                        {theme.confidence === 'high' ? '较高' : theme.confidence === 'medium' ? '中等' : '较低'}
                        <br />
                        <span style={{ opacity: 0.7 }}>点击查看证据</span>
                      </>,
                    )
                  }
                  className="cursor-pointer"
                >
                  {active ? (
                    <rect x={0} y={y - 5} width={W} height={rowH - 3} rx={10} fill="rgba(36,62,99,.055)" />
                  ) : null}
                  <text
                    x={18}
                    y={y + 20}
                    fontSize="13"
                    fontWeight="800"
                    fill={index === 0 ? chartColors.hero : chartColors.faint}
                    className="tabular"
                  >
                    {String(theme.rank).padStart(2, '0')}
                  </text>
                  <text
                    x={48}
                    y={y + 18}
                    fontSize="12.5"
                    fontWeight={active ? 700 : 600}
                    fill={chartColors.ink}
                  >
                    {theme.title}
                  </text>
                  <text x={48} y={y + 34} fontSize="9.5" fill={chartColors.muted}>
                    {theme.direction} · {theme.claimType}
                  </text>
                  <rect
                    x={barLeft}
                    y={y + 9}
                    width={plotW}
                    height={17}
                    rx={8.5}
                    fill={chartColors.track}
                  />
                  <rect
                    x={barLeft}
                    y={y + 9}
                    width={width}
                    height={17}
                    rx={8.5}
                    fill={
                      active
                        ? chartColors.data
                        : index === 0
                          ? chartColors.hero
                          : index === 1
                            ? chartColors.dataSecondary
                            : chartColors.dataTertiary
                    }
                    opacity={active ? 1 : 0.85}
                    className="chart-bar-pop"
                    style={{
                      animationDelay: `${index * 70}ms`,
                      transformOrigin: `${barLeft}px ${y + 9}px`,
                    }}
                  />
                  <text
                    x={W - 10}
                    y={y + 22}
                    textAnchor="end"
                    fontSize="14"
                    fontWeight="800"
                    fill={chartColors.ink}
                    className="tabular"
                  >
                    {theme.mentionCount}
                  </text>
                  {active ? (
                    <line
                      x1={0}
                      x2={W}
                      y1={y + rowH - 7}
                      y2={y + rowH - 7}
                      stroke={chartColors.grid}
                      strokeWidth={0.7}
                    />
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

