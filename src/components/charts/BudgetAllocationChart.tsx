import type { Plan } from '@/types/domain';
import { formatCny, formatPercent } from '@/lib/format';
import { totalPlanCents } from '@/lib/calculations';
import { ChartFrame, LegendDot, useChartTip } from './ChartFrame';
import { ChartTip } from './ChartTip';
import { chartColors } from './chartTheme';

export function BudgetAllocationChart({
  plans,
  capCents,
  selectedPlanId,
  onSelectPlan,
}: {
  plans: Plan[];
  capCents: number;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
}) {
  const { containerRef, tip, showTip, hideTip } = useChartTip();
  const channelNames = [...new Set(plans.flatMap((plan) => plan.channels.map((channel) => channel.channel)))];
  const channelColor = (channel: string) =>
    chartColors.series[Math.max(0, channelNames.indexOf(channel)) % chartColors.series.length];
  const W = 720;
  const H = 250;
  const left = 92;
  const right = 26;
  const top = 34;
  const rowH = 76;
  const plotW = W - left - right;
  const safeCap = Math.max(capCents, 1);

  return (
    <ChartFrame
      title="A / B 方案预算分配"
      subtitle={`按渠道拆分，条形长度对照企业预算上限 ${formatCny(capCents)}；点击方案行切换编辑对象`}
      unit="元"
      source="BASICS · 堆叠条 · 方案编辑区实时数据"
      legend={
        <>
          {channelNames.map((channel) => (
            <LegendDot key={channel} color={channelColor(channel)} label={channel} shape="pill" />
          ))}
        </>
      }
    >
      <div ref={containerRef} className="relative w-full">
        {plans.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center rounded-[12px] border border-dashed border-line bg-[#fbfcfd] text-[12px] text-muted">
            暂无方案预算
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="chart-svg block w-full"
            role="img"
            aria-label={`方案预算分配，企业上限 ${formatCny(capCents)}`}
            onPointerLeave={hideTip}
          >
            <line
              x1={left + plotW}
              x2={left + plotW}
              y1={12}
              y2={H - 24}
              stroke={chartColors.hero}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={left + plotW - 6}
              y={16}
              textAnchor="end"
              fontSize="9"
              fontWeight="700"
              fill={chartColors.hero}
            >
              上限 {formatCny(capCents)}
            </text>
            {plans.map((plan, index) => {
              const y = top + index * rowH;
              const total = totalPlanCents(plan);
              const active = plan.id === selectedPlanId;
              let cursor = left;
              return (
                <g
                  key={plan.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`方案 ${plan.code} ${plan.name}，预算 ${formatCny(total)}`}
                  onClick={() => onSelectPlan(plan.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectPlan(plan.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {active ? (
                    <rect x={0} y={y - 14} width={W} height={rowH - 4} rx={10} fill="rgba(36,62,99,.05)" />
                  ) : null}
                  <text x={14} y={y + 4} fontSize="11" fontWeight="800" fill={chartColors.ink}>
                    方案 {plan.code}
                  </text>
                  <text x={14} y={y + 20} fontSize="9.5" fill={chartColors.muted}>
                    {plan.shortName}
                  </text>
                  <text
                    x={14}
                    y={y + 39}
                    fontSize="12"
                    fontWeight="800"
                    fill={active ? chartColors.ink : chartColors.muted}
                    className="tabular"
                  >
                    {formatCny(total)}
                  </text>
                  <rect x={left} y={y - 6} width={plotW} height={30} rx={15} fill={chartColors.track} />
                  {plan.channels.map((channel) => {
                    const width = (channel.budgetCents / safeCap) * plotW;
                    const segment = (
                      <g key={channel.channel}>
                        <rect
                          x={cursor}
                          y={y - 6}
                          width={Math.max(1.5, width)}
                          height={30}
                          fill={channelColor(channel.channel)}
                          opacity={active ? 0.98 : 0.75}
                          className="chart-bar-pop"
                          style={{
                            animationDelay: `${index * 90}ms`,
                            transformOrigin: `${cursor}px ${y - 6}px`,
                          }}
                        />
                        <rect
                          x={cursor}
                          y={y - 6}
                          width={Math.max(1.5, width)}
                          height={30}
                          fill="transparent"
                          onPointerMove={(event) =>
                            showTip(
                              event,
                              <>
                                <strong>
                                  方案 {plan.code} · {channel.channel}
                                </strong>
                                <br />
                                {formatCny(channel.budgetCents)} · 占方案预算{' '}
                                {formatPercent(total ? channel.budgetCents / total : null, 0)}
                              </>,
                            )
                          }
                        />
                      </g>
                    );
                    cursor += width;
                    return segment;
                  })}
                  {total > safeCap ? (
                    <text x={left + plotW + 4} y={y + 15} fontSize="9" fontWeight="700" fill={chartColors.hero}>
                      超限
                    </text>
                  ) : null}
                  <text x={W - 4} y={y + 44} textAnchor="end" fontSize="9" fill={chartColors.faint}>
                    使用上限的 {formatPercent(total / safeCap, 0)}
                  </text>
                </g>
              );
            })}
            <text x={left} y={H - 10} fontSize="8.5" fill={chartColors.faint}>
              每段为一个渠道预算；总长度不超过虚线即满足约束
            </text>
          </svg>
        )}
        <ChartTip tip={tip} />
      </div>
    </ChartFrame>
  );
}
