import type { Plan, Review } from '@/types/domain';
import { formatCny, formatPercent } from '@/lib/format';
import { computeChannelMetrics } from '@/lib/calculations';
import { ChartFrame, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors, niceMax } from './chartTheme';

type MetricKey = 'ctr' | 'cpcCents' | 'costPerLeadCents';

const metrics: Array<{
  key: MetricKey;
  label: string;
  unit: string;
  format: (value: number | null) => string;
  raw: (value: number | null) => number | null;
  note: string;
}> = [
  {
    key: 'ctr',
    label: 'CTR',
    unit: '%',
    format: (value) => formatPercent(value),
    raw: (value) => (value === null ? null : value * 100),
    note: '点击 ÷ 曝光',
  },
  {
    key: 'cpcCents',
    label: 'CPC',
    unit: '元 / 点击',
    format: (value) => formatCny(value, 2),
    raw: (value) => (value === null ? null : value / 100),
    note: '花费 ÷ 点击',
  },
  {
    key: 'costPerLeadCents',
    label: '有效咨询成本',
    unit: '元 / 条',
    format: (value) => formatCny(value, 2),
    raw: (value) => (value === null ? null : value / 100),
    note: '花费 ÷ 有效咨询',
  },
];

export function ChannelEfficiencyChart({
  plan,
  review,
  selectedChannel,
  onSelectChannel,
  periodLabel,
}: {
  plan: Plan;
  review?: Review;
  selectedChannel?: string;
  onSelectChannel?: (channel: string) => void;
  periodLabel?: string;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const channels = plan.channels.map((channel) => {
    const actual = review?.channels.find((item) => item.channel === channel.channel);
    return {
      channel: channel.channel,
      metrics: computeChannelMetrics(
        channel.channel,
        channel.budgetCents,
        actual ?? {
          channel: channel.channel,
          actualSpendCents: null,
          impressions: null,
          clicks: null,
          leads: null,
        },
      ),
    };
  });
  const W = 860;
  const left = 106;
  const panelGap = 14;
  const panelW = (W - left - panelGap * (metrics.length - 1) - 8) / metrics.length;
  const trackW = panelW - 42;
  const top = 48;
  const rowH = 44;
  const H = top + channels.length * rowH + 26;
  const maxima = metrics.map((metric) =>
    niceMax(Math.max(1, ...channels.map((channel) => metric.raw(channel.metrics[metric.key]) ?? 0)), 4),
  );
  const hasAny = channels.some((channel) =>
    metrics.some((metric) => channel.metrics[metric.key] !== null),
  );

  return (
    <ChartFrame
      title="渠道效率分项"
      subtitle={`CTR、CPC 与有效咨询成本单位不同，使用三栏独立刻度；缺失数据显示为“—”，不按 0 处理${periodLabel ? ` · 投放周期 ${periodLabel}` : ''}`}
      unit="见各栏"
      source="BASICS · 小型多图 · 复盘实际数据"
      legend={
        <span className="text-[12px] text-faint">
          {selectedChannel ? `已聚焦：${selectedChannel}` : '点击任一渠道行可在下方表格中聚焦'}
        </span>
      }
    >
      <div ref={containerRef} className="relative w-full overflow-x-auto scrollbar-thin">
        {!hasAny ? (
          <div className="flex h-[230px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            录入实际曝光、点击与咨询后才能计算效率指标
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full min-w-[620px]"
            role="img"
            aria-label="渠道 CTR、CPC 与有效咨询成本分项对比"
            onPointerLeave={hideTip}
          >
            <text x={left} y={20} fontSize="14" fontWeight="700" fill={chartColors.faint}>
              渠道
            </text>
            {metrics.map((metric, metricIndex) => {
              const x = left + metricIndex * (panelW + panelGap);
              return (
                <g key={metric.key}>
                  <text x={x} y={16} fontSize="14" fontWeight="800" fill={chartColors.ink}>
                    {metric.label}
                  </text>
                  <text x={x} y={30} fontSize="14" fill={chartColors.faint}>
                    {metric.unit} · {metric.note}
                  </text>
                  <line
                    x1={x}
                    x2={x + trackW + 34}
                    y1={top - 10}
                    y2={top - 10}
                    stroke={chartColors.grid}
                    strokeWidth={0.7}
                  />
                </g>
              );
            })}
            {channels.map((channel, rowIndex) => {
              const y = top + rowIndex * rowH;
              const active = selectedChannel === channel.channel;
              return (
                <g
                  key={channel.channel}
                  role={onSelectChannel ? 'button' : undefined}
                  tabIndex={onSelectChannel ? 0 : undefined}
                  aria-label={`${channel.channel} 的渠道效率`}
                  onClick={() => onSelectChannel?.(channel.channel)}
                  onKeyDown={(event) => {
                    if (onSelectChannel && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelectChannel(channel.channel);
                    }
                  }}
                  className={onSelectChannel ? 'cursor-pointer' : undefined}
                >
                  {active ? (
                    <rect x={0} y={y - 7} width={W} height={rowH - 2} rx={8} fill="rgba(36,62,99,.05)" />
                  ) : null}
                  <text
                    x={12}
                    y={y + 16}
                    fontSize="14"
                    fontWeight={active ? 700 : 600}
                    fill={active ? chartColors.ink : chartColors.muted}
                  >
                    {channel.channel}
                  </text>
                  {metrics.map((metric, metricIndex) => {
                    const x = left + metricIndex * (panelW + panelGap);
                    const value = channel.metrics[metric.key];
                    const raw = metric.raw(value);
                    const width = raw === null ? 0 : Math.max(2, (raw / maxima[metricIndex]) * trackW);
                    return (
                      <g key={metric.key}>
                        <rect
                          x={x}
                          y={y + 3}
                          width={trackW}
                          height={9}
                          rx={4.5}
                          fill={chartColors.track}
                        />
                        {raw === null ? (
                          <text
                            x={x + 4}
                            y={y + 11}
                            fontSize="14"
                            fill={chartColors.neutral}
                            onPointerMove={(event) =>
                              showTip(
                                event,
                                <>
                                  <strong>{channel.channel}</strong>
                                  <br />
                                  {metric.label}：暂无数据
                                </>,
                              )
                            }
                          >
                            —
                          </text>
                        ) : (
                          <g>
                            <rect
                              x={x}
                              y={y + 3}
                              width={width}
                              height={9}
                              rx={4.5}
                              fill={metricIndex === 2 ? chartColors.hero : chartColors.data}
                              opacity={metricIndex === 0 ? 0.82 : 1}
                              className="chart-bar-pop"
                              style={{
                                animationDelay: `${rowIndex * 60 + metricIndex * 80}ms`,
                                transformOrigin: `${x}px ${y + 3}px`,
                              }}
                              onPointerMove={(event) =>
                                showTip(
                                  event,
                                  <>
                                    <strong>{channel.channel}</strong>
                                    <br />
                                    {metric.label}：{metric.format(value)}
                                  </>,
                                )
                              }
                            />
                            <text
                              x={x + trackW + 4}
                              y={y + 11.5}
                              fontSize="14"
                              fontWeight="800"
                              fill={chartColors.ink}
                              className="tabular"
                            >
                              {metric.format(value)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
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
