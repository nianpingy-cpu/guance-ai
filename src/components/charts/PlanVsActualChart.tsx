import { shortChartLabel } from '@/lib/format';
import type { Plan, Review } from '@/types/domain';
import { formatCompact, formatCny, formatNumber } from '@/lib/format';
import { computeChannelMetrics } from '@/lib/calculations';
import { Segmented } from '@/components/ui/Form';
import { ChartFrame, LegendDot, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { axisTicks, chartColors, niceMax } from './chartTheme';

export type ComparisonMetric = 'spend' | 'impressions' | 'clicks' | 'leads';

const metricMeta: Record<
  ComparisonMetric,
  { label: string; unit: string; title: string; note: string }
> = {
  spend: {
    label: '花费',
    unit: '元',
    title: '渠道计划与实际花费',
    note: '计划与实际使用同一货币刻度；实际花费可以高于或低于计划。',
  },
  impressions: {
    label: '曝光',
    unit: '次',
    title: '渠道实际曝光',
    note: '曝光没有对应的计划值，因此只展示实际数，不能与预算同轴比较。',
  },
  clicks: {
    label: '点击',
    unit: '次',
    title: '渠道实际点击',
    note: '点击没有对应的计划值，因此只展示实际数。',
  },
  leads: {
    label: '咨询',
    unit: '条',
    title: '渠道实际有效咨询',
    note: '有效咨询没有对应的计划值；演示数据不代表真实平台报表。',
  },
};

export function PlanVsActualChart({
  plan,
  review,
  metric,
  onMetricChange,
  periodLabel,
}: {
  plan: Plan;
  review?: Review;
  metric: ComparisonMetric;
  onMetricChange: (metric: ComparisonMetric) => void;
  periodLabel?: string;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const meta = metricMeta[metric];
  const channels = plan.channels.map((channel) => {
    const actual = review?.channels.find((item) => item.channel === channel.channel);
    const metrics = computeChannelMetrics(channel.channel, channel.budgetCents, actual ?? {
      channel: channel.channel,
      actualSpendCents: null,
      impressions: null,
      clicks: null,
      leads: null,
    });
    return { channel, actual, metrics };
  });

  const values = channels.flatMap(({ channel, actual }) => {
    if (metric === 'spend') {
      return [
        channel.budgetCents / 100,
        actual?.actualSpendCents === null || actual?.actualSpendCents === undefined
          ? null
          : actual.actualSpendCents / 100,
      ];
    }
    const raw =
      metric === 'impressions'
        ? actual?.impressions ?? null
        : metric === 'clicks'
          ? actual?.clicks ?? null
          : actual?.leads ?? null;
    return [raw];
  });
  const numeric = values.filter((value): value is number => value !== null && Number.isFinite(value));
  const max = niceMax(Math.max(1, ...(numeric.length ? numeric : [1])), 4);
  const W = Math.max(720, channels.length * 170 + 72);
  const H = 300;
  const left = 52;
  const right = 20;
  const top = 26;
  const bottom = 58;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const groups = channels.length || 1;
  const groupW = plotW / groups;
  const barW = metric === 'spend' ? Math.min(24, groupW / 3.4) : Math.min(34, groupW / 2.8);
  const y = (value: number) => top + plotH - (value / max) * plotH;

  const displayValue = (value: number | null) => {
    if (value === null) return '暂无数据';
    return metric === 'spend' ? formatCny(value * 100) : formatNumber(value);
  };

  return (
    <ChartFrame
      title={meta.title}
      subtitle={`仅比较实际录入的数据；未录入显示“暂无数据”，不按 0 处理${periodLabel ? ` · 投放周期 ${periodLabel}` : ''}`}
      unit={meta.unit}
      source="BASICS · 分组柱 · 复盘录入区保存后实时更新"
      action={
        <Segmented
          size="sm"
          ariaLabel="选择对比指标"
          value={metric}
          onChange={onMetricChange}
          options={(Object.keys(metricMeta) as ComparisonMetric[]).map((key) => ({
            value: key,
            label: metricMeta[key].label,
          }))}
        />
      }
      legend={
        <>
          {metric === 'spend' ? (
            <>
              <LegendDot color={chartColors.neutral} label="计划预算" shape="pill" />
              <LegendDot color={chartColors.data} label="实际花费" shape="pill" />
            </>
          ) : (
            <LegendDot color={chartColors.data} label={`实际${meta.label}`} shape="pill" />
          )}
        </>
      }
      note={meta.note}
    >
      <div ref={containerRef} className="relative w-full">
        {channels.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            该方案暂无渠道数据
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            style={channels.length > 4 ? { minWidth: W } : undefined}
            role="img"
            aria-label={`${meta.title}，单位 ${meta.unit}`}
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
                  strokeWidth={tick === 0 ? 0.9 : 0.7}
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text
                  x={left - 9}
                  y={y(tick) + 3.5}
                  textAnchor="end"
                  fontSize="14"
                  fill={chartColors.faint}
                  className="tabular"
                >
                  {metric === 'spend' ? `¥${formatCompact(tick)}` : formatCompact(tick)}
                </text>
              </g>
            ))}
            {channels.map(({ channel, actual, metrics }, index) => {
              const groupCenter = left + groupW * index + groupW / 2;
              const planned = channel.budgetCents / 100;
              const actualValue =
                metric === 'spend'
                  ? actual?.actualSpendCents === null || actual?.actualSpendCents === undefined
                    ? null
                    : actual.actualSpendCents / 100
                  : metric === 'impressions'
                    ? actual?.impressions ?? null
                    : metric === 'clicks'
                      ? actual?.clicks ?? null
                      : actual?.leads ?? null;
              const plannedX = groupCenter - barW - 3;
              const actualX = groupCenter + 3;
              const plannedHeight = Math.max(1, (planned / max) * plotH);
              const actualHeight = actualValue === null ? 0 : Math.max(1, (actualValue / max) * plotH);
              return (
                <g key={channel.channel}>
                  {metric === 'spend' ? (
                    <rect
                      x={plannedX}
                      y={top + plotH - plannedHeight}
                      width={barW}
                      height={plannedHeight}
                      rx={5}
                      fill={chartColors.neutral}
                      opacity={0.55}
                      className="chart-bar-pop"
                      style={{ animationDelay: `${index * 60}ms`, transformOrigin: `${plannedX}px ${top + plotH}px` }}
                      onPointerMove={(event) =>
                        showTip(
                          event,
                          <>
                            <strong>{channel.channel} · 计划预算</strong>
                            <br />
                            {formatCny(channel.budgetCents)}
                          </>,
                        )
                      }
                    />
                  ) : null}
                  {actualValue === null ? (
                    <g>
                      <rect
                        x={metric === 'spend' ? actualX : groupCenter - barW / 2}
                        y={top + plotH - 28}
                        width={barW}
                        height={24}
                        rx={5}
                        fill="rgba(154,166,181,.12)"
                        stroke={chartColors.neutral}
                        strokeDasharray="3 3"
                        strokeWidth={0.8}
                      />
                      <text
                        x={metric === 'spend' ? actualX + barW / 2 : groupCenter}
                        y={top + plotH - 13}
                        textAnchor="middle"
                        fontSize="14"
                        fill={chartColors.faint}
                      >
                        暂无
                      </text>
                    </g>
                  ) : (
                    <rect
                      x={metric === 'spend' ? actualX : groupCenter - barW / 2}
                      y={top + plotH - actualHeight}
                      width={barW}
                      height={actualHeight}
                      rx={5}
                      fill={chartColors.data}
                      className="chart-bar-pop"
                      style={{ animationDelay: `${180 + index * 60}ms`, transformOrigin: `${actualX}px ${top + plotH}px` }}
                      onPointerMove={(event) =>
                        showTip(
                          event,
                          <>
                            <strong>
                              {channel.channel} · 实际{meta.label}
                            </strong>
                            <br />
                            {displayValue(actualValue)}
                            {metric === 'spend' && planned > 0
                              ? ` · ${actualValue > planned ? '高于' : '低于'}计划 ${formatCny(
                                  Math.abs(actualValue * 100 - channel.budgetCents),
                                )}`
                              : ''}
                          </>,
                        )
                      }
                    />
                  )}
                  {actualValue !== null ? (
                    <text
                      x={metric === 'spend' ? actualX + barW / 2 : groupCenter}
                      y={top + plotH - actualHeight - 7}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="800"
                      fill={chartColors.ink}
                      className="tabular"
                    >
                      {metric === 'spend'
                        ? formatCny(actualValue * 100).replace('¥', '')
                        : formatCompact(actualValue)}
                    </text>
                  ) : null}
                  <text
                    x={groupCenter}
                    y={H - 34}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    fill={chartColors.muted}
                  >
                    <title>{channel.channel}</title>{shortChartLabel(channel.channel, 10)}
                  </text>
                  {metric === 'spend' ? (
                    <text
                      x={groupCenter}
                      y={H - 10}
                      textAnchor="middle"
                      fontSize="14"
                      fill={chartColors.faint}
                    >
                      计划 {formatCompact(planned)}
                    </text>
                  ) : (
                    <text
                      x={groupCenter}
                      y={H - 10}
                      textAnchor="middle"
                      fontSize="14"
                      fill={chartColors.faint}
                    >
                      {metrics.ctr !== null ? `CTR ${(metrics.ctr * 100).toFixed(2)}%` : 'CTR 暂无'}
                    </text>
                  )}
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

export { metricMeta as comparisonMetricMeta };
