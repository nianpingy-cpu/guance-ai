import type { InsightTheme, Signal } from '@/types/domain';
import { statusLabel } from '@/lib/calculations';
import { ChartFrame, LegendDot, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors, niceMax } from './chartTheme';

type QualityKey = 'verified' | 'pending' | 'disputed' | 'duplicate';

const qualityOrder: QualityKey[] = ['verified', 'pending', 'disputed', 'duplicate'];

export function EvidenceQualityChart({
  themes,
  signals,
  selectedThemeId,
  onSelectTheme,
  periodLabel,
}: {
  themes: InsightTheme[];
  signals: Signal[];
  selectedThemeId: string;
  onSelectTheme: (id: string) => void;
  periodLabel?: string;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const sorted = [...themes].sort((a, b) => a.rank - b.rank);
  const rows = sorted.map((theme) => {
    const counts: Record<QualityKey, number> = {
      verified: 0,
      pending: 0,
      disputed: 0,
      duplicate: 0,
    };
    theme.evidenceSignalIds.forEach((id) => {
      const signal = signals.find((item) => item.id === id);
      if (signal) counts[signal.status] += 1;
    });
    const total = qualityOrder.reduce((sum, key) => sum + counts[key], 0);
    return { theme, counts, total };
  });
  const W = 660;
  const rowH = 64;
  const top = 20;
  const H = top + rows.length * rowH + 18;
  const barLeft = 250;
  const barRight = 42;
  const plotW = W - barLeft - barRight;
  const max = niceMax(Math.max(1, ...rows.map((row) => row.total)), 4);

  return (
    <ChartFrame
      title="证据质量结构"
      subtitle={`每个主题的证据由已核实、待核实、有争议与重复记录构成${periodLabel ? ` · 证据期 ${periodLabel}` : ''}`}
      unit="条"
      source="BASICS · 堆叠条 · 观策AI 模拟情报库"
      legend={
        <>
          <LegendDot color={chartColors.quality.verified} label="已核实" shape="pill" />
          <LegendDot color={chartColors.quality.pending} label="待核实" shape="pill" />
          <LegendDot color={chartColors.quality.disputed} label="有争议" shape="pill" />
          <LegendDot color={chartColors.quality.duplicate} label="重复" shape="pill" />
        </>
      }
    >
      <div ref={containerRef} className="relative w-full">
        {rows.length === 0 ? (
          <div className="flex h-[190px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            暂无证据质量数据
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            role="img"
            aria-label="各主题的证据质量结构"
            onPointerLeave={hideTip}
          >
            {rows.map((row, index) => {
              const y = top + index * rowH;
              const active = row.theme.id === selectedThemeId;
              let cursor = barLeft;
              return (
                <g
                  key={row.theme.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${row.theme.title}，共 ${row.total} 条证据`}
                  onClick={() => onSelectTheme(row.theme.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectTheme(row.theme.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {active ? (
                    <rect x={0} y={y - 5} width={W} height={rowH - 2} rx={9} fill="rgba(36,62,99,.05)" />
                  ) : null}
                  <text
                    x={14}
                    y={y + 20}
                    fontSize="14"
                    fontWeight={active ? 700 : 600}
                    fill={active ? chartColors.ink : chartColors.muted}
                  >
                    {row.theme.rank}. {row.theme.title}
                  </text>
                  <text x={14} y={y + 44} fontSize="14" fill={chartColors.faint}>
                    {row.theme.confidence === 'high'
                      ? '置信度较高'
                      : row.theme.confidence === 'medium'
                        ? '置信度中等'
                        : '置信度较低'}
                  </text>
                  <rect
                    x={barLeft}
                    y={y + 12}
                    width={plotW}
                    height={15}
                    rx={7.5}
                    fill={chartColors.track}
                  />
                  {qualityOrder.map((key) => {
                    const count = row.counts[key];
                    if (count === 0) return null;
                    const width = (count / max) * plotW;
                    const segment = (
                      <g key={key}>
                        <rect
                          x={cursor}
                          y={y + 12}
                          width={Math.max(2, width)}
                          height={15}
                          fill={chartColors.quality[key]}
                          opacity={key === 'duplicate' ? 0.65 : 0.94}
                          className="chart-bar-pop"
                          style={{
                            animationDelay: `${index * 60}ms`,
                            transformOrigin: `${cursor}px ${y + 12}px`,
                          }}
                        />
                        <rect
                          x={cursor}
                          y={y + 12}
                          width={Math.max(2, width)}
                          height={15}
                          fill="transparent"
                          onPointerMove={(event) =>
                            showTip(
                              event,
                              <>
                                <strong>{row.theme.title}</strong>
                                <br />
                                {statusLabel[key]}：{count} 条
                              </>,
                            )
                          }
                        />
                      </g>
                    );
                    cursor += width;
                    return segment;
                  })}
                  <text
                    x={W - 8}
                    y={y + 24}
                    textAnchor="end"
                    fontSize="14"
                    fontWeight="800"
                    fill={chartColors.ink}
                    className="tabular"
                  >
                    {row.total}
                  </text>
                </g>
              );
            })}
            <line
              x1={barLeft}
              x2={W - barRight}
              y1={H - 8}
              y2={H - 8}
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
