import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardCheck,
  FileText,
  PencilLine,
  Plus,
  Printer,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { Plan, Review, ReviewChannelActual } from '@/types/domain';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toast';
import {
  computeChannelMetrics,
  computeReviewMetrics,
  getApprovalHealth,
  getReviewForApproval,
  totalPlanCents,
} from '@/lib/calculations';
import {
  formatCny,
  formatDateTime,
  formatNumber,
  formatPercent,
  parseWholeNumber,
  parseYuanToCents,
} from '@/lib/format';
import { PageHeader, DemoBadge, MetaItem } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Field, InfoBanner } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/Progress';
import { Modal } from '@/components/ui/Overlay';
import { PlanVsActualChart, type ComparisonMetric } from '@/components/charts/PlanVsActualChart';
import { ChannelEfficiencyChart } from '@/components/charts/ChannelEfficiencyChart';

const emptyChannels = (plan: Plan): ReviewChannelActual[] =>
  plan.channels.map((channel) => ({
    channel: channel.channel,
    actualSpendCents: null,
    impressions: null,
    clicks: null,
    leads: null,
  }));

export function ReviewPage() {
  const data = useAppStore((state) => state);
  const navigate = useNavigate();
  const health = getApprovalHealth(data);
  const approval = health.state === 'valid' || health.state === 'needs-reconfirm' ? health.approval : undefined;
  const review = approval ? getReviewForApproval(data, approval.id) : undefined;
  const [metric, setMetric] = useState<ComparisonMetric>('spend');
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  if (health.state === 'hold') {
    return (
      <div className="page-wrap">
        <PageHeader
          eyebrow="执行之后 · 回到信息更新"
          title="效果复盘"
          description="本轮尚未投放，因此没有可录入的实际数据。"
          actions={
            <Button variant="primary" onClick={() => navigate('/strategy')}>
              返回策略页
            </Button>
          }
        />
        <Card>
          <EmptyState
            title="本轮暂不投放"
            description={health.reason}
            action={
              <Button
                onClick={() => {
                  data.resumePlanSelection();
                  toast('已恢复方案选择', '可以重新确认方案后进入复盘。', 'success');
                  navigate('/strategy');
                }}
              >
                恢复方案选择
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="page-wrap">
        <PageHeader
          eyebrow="执行之后 · 回到信息更新"
          title="效果复盘"
          description="确认一套营销方案并保存审批快照后，才能录入实际数据并形成下一轮任务。"
          actions={
            <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => navigate('/strategy')}>
              去比较并确认方案
            </Button>
          }
        />
        <Card>
          <EmptyState
            title="尚未确认方案"
            description="系统不会在方案未确认时生成复盘结论。请先在“洞察与策略”中选择方案、校验预算并完成人工确认。"
            action={
              <Button variant="primary" onClick={() => navigate('/strategy')}>
                继续营销决策
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  const plan = approval.plan;
  const channels = plan.channels.map((channel) => {
    const actual = review?.channels.find((item) => item.channel === channel.channel);
    return {
      planned: channel,
      actual: actual ?? {
        channel: channel.channel,
        actualSpendCents: null,
        impressions: null,
        clicks: null,
        leads: null,
      },
      metrics: computeChannelMetrics(channel.channel, channel.budgetCents, actual ?? {
        channel: channel.channel,
        actualSpendCents: null,
        impressions: null,
        clicks: null,
        leads: null,
      }),
    };
  });
  const metrics = computeReviewMetrics(
    totalPlanCents(plan),
    review?.channels ?? emptyChannels(plan),
  );
  const hasAnyActual = Boolean(
    review?.channels.some(
      (channel) =>
        channel.actualSpendCents !== null ||
        channel.impressions !== null ||
        channel.clicks !== null ||
        channel.leads !== null,
    ),
  );
  const spendDelta =
    metrics.actualSpendCents === null ? null : metrics.actualSpendCents - metrics.plannedCents;
  const bestLeads = [...channels].sort((a, b) => (b.actual.leads ?? -1) - (a.actual.leads ?? -1))[0];
  const worstCost = [...channels]
    .filter((channel) => channel.metrics.costPerLeadCents !== null)
    .sort((a, b) => (b.metrics.costPerLeadCents ?? 0) - (a.metrics.costPerLeadCents ?? 0))[0];
  const suggestions = (() => {
    if (review?.suggestions.length) return review.suggestions;
    const evidenceIds = approval.evidenceSignalIds;
    const candidates = data.signals
      .filter((signal) => evidenceIds.includes(signal.id))
      .filter((signal) => signal.status === 'pending' || signal.status === 'disputed')
      .slice(0, 3);
    return candidates.map((signal) => ({
      id: `SUG-${signal.id}`,
      title: `核实：${signal.title}`,
      detail: signal.impact,
      linkedSignalIds: [signal.id],
    }));
  })();

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="执行之后 · 回到信息更新"
        title="效果复盘"
        description="对比计划与实际，记录观察、差异和无法确认的判断，并把下一轮需要补充的信息变成真实任务。所有结果均为演示数据。"
        meta={
          <>
            <MetaItem label="已确认方案" value={`${approval.planCode} · ${plan.shortName}`} />
            <MetaItem label="实际数据" value={hasAnyActual ? '已录入 · 演示' : '待录入'} />
            <MetaItem label="最近更新" value={review ? formatDateTime(review.updatedAt) : '暂无'} />
            <DemoBadge />
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<FileText size={14} />} onClick={() => setSnapshotOpen(true)}>
              原始方案快照
            </Button>
            <Button variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>
              打印 / PDF
            </Button>
          </>
        }
      />

      {health.state === 'needs-reconfirm' ? (
        <InfoBanner
          tone="warning"
          className="mb-4"
          title="审批依据已变化"
          action={
            <Button size="sm" variant="primary" onClick={() => navigate('/strategy')}>
              重新确认
            </Button>
          }
        >
          当前复盘仍基于上次审批快照 {approval.id}。企业预算或关键情报已变化，建议重新确认后再继续下一轮；历史实际数据不会被删除。
        </InfoBanner>
      ) : (
        <InfoBanner tone="success" className="mb-4" title={`方案 ${approval.planCode} 已确认，可按渠道录入实际数据`}>
          审批快照 {approval.id} · {formatDateTime(approval.approvedAt)}。当前数据性质为“演示数据”，不对应真实广告平台报表。
        </InfoBanner>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="已确认方案"
          value={approval.planCode}
          unit={plan.shortName}
          tone="navy"
          note={plan.name}
        />
        <MetricCard label="计划预算" value={formatCny(metrics.plannedCents).replace('¥', '')} unit="元" note="来自审批快照" />
        <MetricCard
          label="实际花费"
          value={metrics.actualSpendCents === null ? <span className="text-[20px] font-semibold">暂无数据</span> : formatCny(metrics.actualSpendCents).replace('¥', '')}
          unit={metrics.actualSpendCents === null ? '' : '元'}
          tone="terracotta"
          note={
            spendDelta === null
              ? '缺渠道数据，暂不计算'
              : spendDelta === 0
                ? '与计划一致'
                : `较计划${spendDelta > 0 ? '高' : '低'} ${formatCny(Math.abs(spendDelta))}`
          }
        />
        <MetricCard
          label="曝光量"
          value={metrics.impressions === null ? <span className="text-[20px] font-semibold">暂无数据</span> : formatNumber(metrics.impressions)}
          unit={metrics.impressions === null ? '' : '次'}
          note="所有渠道合计"
        />
        <MetricCard
          label="点击量"
          value={metrics.clicks === null ? <span className="text-[20px] font-semibold">暂无数据</span> : formatNumber(metrics.clicks)}
          unit={metrics.clicks === null ? '' : '次'}
          note="所有渠道合计"
        />
        <MetricCard
          label="有效咨询"
          value={metrics.leads === null ? <span className="text-[20px] font-semibold">暂无数据</span> : formatNumber(metrics.leads)}
          unit={metrics.leads === null ? '' : '条'}
          tone="mint"
          note={`咨询成本 ${formatCny(metrics.costPerLeadCents, 2)}`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[13px] border border-line bg-white px-4 py-3 sm:grid-cols-4">
        <DerivedMetric label="CTR" value={formatPercent(metrics.ctr)} hint="点击 ÷ 曝光" />
        <DerivedMetric label="CPC" value={formatCny(metrics.cpcCents, 2)} hint="花费 ÷ 点击" />
        <DerivedMetric label="点击 → 咨询" value={formatPercent(metrics.clickToLeadRate)} hint="咨询 ÷ 点击" />
        <DerivedMetric
          label="总转化率"
          value={
            metrics.impressions && metrics.leads !== null
              ? formatPercent(metrics.leads / metrics.impressions, 3)
              : '暂无数据'
          }
          hint="咨询 ÷ 曝光"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <PlanVsActualChart
            plan={plan}
            review={review}
            metric={metric}
            onMetricChange={setMetric}
            periodLabel={`${data.company.campaignStart} — ${data.company.campaignEnd}`}
          />
        </div>
        <Card className="lg:col-span-4">
          <SectionHeader
            eyebrow="本轮快照"
            title={`方案 ${approval.planCode} · ${plan.shortName}`}
            description={plan.positioning}
            action={<Tag tone="mint" dot>已确认</Tag>}
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[10px] border border-line px-3 py-2">
              <p className="text-[10px] text-faint">计划预算</p>
              <p className="tabular mt-0.5 text-[15px] font-bold text-ink">{formatCny(totalPlanCents(plan))}</p>
            </div>
            <div className="rounded-[10px] border border-line px-3 py-2">
              <p className="text-[10px] text-faint">实际花费</p>
              <p className="tabular mt-0.5 text-[15px] font-bold text-ink">{formatCny(metrics.actualSpendCents)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            {plan.channels.map((channel) => (
              <div key={channel.channel} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-muted">{channel.channel}</span>
                <span className="tabular text-ink">{formatCny(channel.budgetCents)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[11px] bg-[#f8fafb] px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">数据性质</p>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              本轮为模拟投放结果，无真实平台接口。没有转化、成交或退款数据，因此不计算 ROAS。
            </p>
          </div>
          <Button className="mt-3 w-full" icon={<FileText size={13} />} onClick={() => setSnapshotOpen(true)}>
            查看原始方案快照
          </Button>
        </Card>
      </div>

      <Card className="mt-4" padded={false}>
        <div className="border-b border-line p-5">
          <SectionHeader
            title="实际数据录入"
            description="录入后指标、图表与下一轮建议会立即更新。留空字段显示“暂无数据”，不会按 0 处理。金额单位为元，其余为非负整数。"
            action={
              <Tag tone="warning">
                <Sparkles size={11} /> 演示数据
              </Tag>
            }
          />
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th>渠道</th>
                <th>计划预算</th>
                <th>实际花费（元）</th>
                <th>曝光量</th>
                <th>点击量</th>
                <th>有效咨询</th>
                <th>CTR</th>
                <th>CPC</th>
                <th>咨询成本</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(({ planned, actual, metrics: channelMetrics }) => (
                <tr
                  key={planned.channel}
                  className={selectedChannel === planned.channel ? 'bg-[#f7faff]' : undefined}
                  onClick={() => setSelectedChannel(planned.channel)}
                >
                  <td>
                    <button
                      type="button"
                      className="text-left text-[12px] font-semibold text-ink hover:text-brand"
                      onClick={() => setSelectedChannel(planned.channel)}
                    >
                      {planned.channel}
                    </button>
                    <p className="mt-0.5 max-w-[150px] text-[9px] leading-4 text-faint">{planned.role}</p>
                  </td>
                  <td className="tabular text-[11px] text-muted">{formatCny(planned.budgetCents)}</td>
                  <td>
                    <MoneyCell
                      value={actual.actualSpendCents}
                      label={`${planned.channel}实际花费`}
                      onCommit={(value) => {
                        const result = data.updateReviewChannel(approval.id, planned.channel, {
                          actualSpendCents: value,
                        });
                        if (!result.ok) toast('金额未保存', result.message, 'danger');
                      }}
                    />
                  </td>
                  <td>
                    <CountCell
                      value={actual.impressions}
                      label={`${planned.channel}曝光量`}
                      onCommit={(value) => {
                        const result = data.updateReviewChannel(approval.id, planned.channel, { impressions: value });
                        if (!result.ok) toast('曝光量未保存', result.message, 'danger');
                      }}
                    />
                  </td>
                  <td>
                    <CountCell
                      value={actual.clicks}
                      label={`${planned.channel}点击量`}
                      onCommit={(value) => {
                        const result = data.updateReviewChannel(approval.id, planned.channel, { clicks: value });
                        if (!result.ok) toast('点击量未保存', result.message, 'danger');
                      }}
                    />
                  </td>
                  <td>
                    <CountCell
                      value={actual.leads}
                      label={`${planned.channel}有效咨询`}
                      onCommit={(value) => {
                        const result = data.updateReviewChannel(approval.id, planned.channel, { leads: value });
                        if (!result.ok) toast('咨询数未保存', result.message, 'danger');
                      }}
                    />
                  </td>
                  <td className="tabular text-[11px]">{formatPercent(channelMetrics.ctr)}</td>
                  <td className="tabular text-[11px]">{formatCny(channelMetrics.cpcCents, 2)}</td>
                  <td className="tabular text-[11px]">{formatCny(channelMetrics.costPerLeadCents, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          <p className="text-[10px] text-muted">
            没有提供的数据显示为“暂无数据”；有花费但咨询为 0 时不计算咨询成本。
          </p>
          <Tag tone="outline">数据保存在本机浏览器</Tag>
        </div>
      </Card>

      <div className="mt-4">
        <ChannelEfficiencyChart
          plan={plan}
          review={review}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          periodLabel={`${data.company.campaignStart} — ${data.company.campaignEnd}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <SectionHeader
            eyebrow="复盘结论"
            title="观察、差异与仍未确认的判断"
            description="图表只说明录入数据之间的关系；以下文字区分观察、推测与待确认信息。"
            action={
              <Button size="sm" icon={<PencilLine size={13} />} onClick={() => setEditOpen(true)}>
                编辑复盘备注
              </Button>
            }
          />

          <div className="mt-4 space-y-4">
            <EditorialBlock label="01 · 观察到的结果">
              {review?.observations?.trim() || (
                <span className="text-faint">尚未填写观察。可根据上方的曝光、点击与咨询数据补充事实描述。</span>
              )}
            </EditorialBlock>

            <EditorialBlock label="02 · 与原计划的差异">
              <ul className="space-y-1.5">
                <li>
                  实际花费{' '}
                  <span className="font-semibold text-ink">
                    {metrics.actualSpendCents === null
                      ? '暂无完整数据'
                      : spendDelta === 0
                        ? '与计划一致'
                        : `${spendDelta !== null && spendDelta > 0 ? '高于' : '低于'}计划 ${formatCny(Math.abs(spendDelta ?? 0))}`}
                  </span>
                  。计划预算 {formatCny(metrics.plannedCents)}，实际录入合计 {formatCny(metrics.actualSpendCents)}。
                </li>
                <li>
                  有效咨询贡献最高的渠道是{' '}
                  <span className="font-semibold text-ink">
                    {bestLeads && bestLeads.actual.leads !== null ? bestLeads.planned.channel : '暂无数据'}
                  </span>
                  {bestLeads && bestLeads.actual.leads !== null ? `，共 ${formatNumber(bestLeads.actual.leads)} 条。` : '。'}
                </li>
                <li>
                  当前有效咨询成本最高的是{' '}
                  <span className="font-semibold text-ink">{worstCost?.planned.channel ?? '暂无数据'}</span>
                  {worstCost ? `，为 ${formatCny(worstCost.metrics.costPerLeadCents, 2)}。` : '。'}
                </li>
                <li className="text-faint">
                  本轮没有设置计划咨询目标，因此不计算“咨询达成率”，也不把渠道差异写成因果结论。
                </li>
              </ul>
            </EditorialBlock>

            <EditorialBlock label="03 · 可能原因（推测）" tone="inference">
              {review?.possibleReasons?.trim() || (
                <span className="text-faint">尚未填写。请明确标注为推测，并避免把相关性写成因果。</span>
              )}
            </EditorialBlock>

            <EditorialBlock label="04 · 当前无法确认的判断" tone="caution">
              {review?.unconfirmed?.trim() || (
                <span className="text-faint">尚未填写。建议补充咨询质量、成交、退款与配送成本数据。</span>
              )}
            </EditorialBlock>

            {review?.note ? (
              <p className="border-t border-line pt-3 text-[10px] leading-5 text-faint">复盘备注：{review.note}</p>
            ) : null}
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <SectionHeader eyebrow="数据质量" title="这份复盘能说明什么" />
          <div className="mt-4 space-y-2.5">
            <QualityRow label="数据性质" value="演示数据 · 模拟" tone="warning" />
            <QualityRow label="覆盖周期" value="一周单轮" />
            <QualityRow label="实际数据完整性" value={hasAnyActual ? '已录入' : '待录入'} tone={hasAnyActual ? 'mint' : 'neutral'} />
            <QualityRow label="缺失字段" value={missingFields(review, plan)} tone={missingFields(review, plan) === '无' ? 'mint' : 'warning'} />
            <QualityRow label="转化 / 退款" value="暂无数据" />
            <QualityRow label="归因方式" value="未建模，仅描述" />
          </div>
          <div className="mt-4 rounded-[11px] border border-[#f0dfbd] bg-[#fdfaf2] px-3.5 py-3">
            <p className="text-[10px] font-bold text-[#7b5718]">解释边界</p>
            <p className="mt-1 text-[11px] leading-5 text-[#7b5718]">
              不能根据本轮差异判断“某个内容导致咨询增加”。需要下一轮控制变量、补充咨询质量与成本数据。
            </p>
          </div>
          <Button className="mt-3 w-full" icon={<ShieldAlert size={13} />} onClick={() => navigate('/signals')}>
            查看待补情报任务
          </Button>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <SectionHeader
            eyebrow="下一轮任务"
            title="需要补充的信息"
            description="点击加入后会在情报页生成真实待办，并保留关联记录。"
            action={<Tag tone="brand">{suggestions.length} 项建议</Tag>}
          />
          <div className="mt-4 space-y-2">
            {suggestions.map((suggestion, index) => {
              const added = data.feedbackTasks.some((task) => task.title === suggestion.title);
              return (
                <div
                  key={suggestion.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-line px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="tabular text-[9px] font-bold text-faint">0{index + 1}</span>
                      <p className="text-[12px] font-semibold text-ink">{suggestion.title}</p>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-muted">{suggestion.detail}</p>
                    <p className="mt-1 text-[9px] text-faint">关联：{suggestion.linkedSignalIds.join('、')}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? 'ghost' : 'mint'}
                    icon={added ? <Check size={12} /> : <Plus size={12} />}
                    disabled={added}
                    onClick={() => {
                      const result = data.addFeedbackTask({
                        title: suggestion.title,
                        detail: suggestion.detail,
                        trigger: '来自本轮复盘',
                        linkedSignalIds: suggestion.linkedSignalIds,
                      });
                      if (!result.ok) {
                        toast('未添加任务', result.message, 'warning');
                        return;
                      }
                      toast('已加入下一轮情报任务', '情报页已出现新的待办，可继续补充证据。', 'success');
                    }}
                  >
                    {added ? '已加入' : '加入下一轮情报任务'}
                  </Button>
                </div>
              );
            })}
            {suggestions.length === 0 ? (
              <EmptyState compact title="暂无下一轮建议" description="填写复盘观察后，可按需要手动创建补证任务。" />
            ) : null}
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <SectionHeader eyebrow="闭环" title="从复盘回到情报" />
          <div className="mt-4 space-y-3">
            <div className="rounded-[11px] border border-line bg-[#fbfcfd] p-3">
              <p className="text-[10px] font-bold text-ink">当前待办</p>
              <p className="tabular mt-1 text-[22px] font-bold text-ink">
                {data.feedbackTasks.filter((task) => task.status === 'open').length}
              </p>
              <p className="text-[10px] text-muted">项未完成情报任务</p>
            </div>
            <p className="text-[11px] leading-5 text-muted">
              下一轮任务会保留来源与关联情报，不会自动生成“新结论”。补充信息后，仍需要人工核实与重新确认方案。
            </p>
            <Button className="w-full" variant="primary" icon={<ArrowUpRight size={13} />} onClick={() => navigate('/signals')}>
              前往情报页查看待办
            </Button>
            <Button className="w-full" icon={<ClipboardCheck size={13} />} onClick={() => navigate('/strategy')}>
              返回策略与方案
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-white/60 px-4 py-3">
        <p className="text-[10px] leading-5 text-muted">
          <span className="font-semibold text-ink">复盘边界：</span>
          所有实际数据为演示输入；无真实投放接口、无归因模型、无成交或退款数据，因此不计算 ROAS，也不将差异解释为因果。
        </p>
        <span className="text-[10px] text-faint">数据保存于本机 · 可打印为 PDF</span>
      </div>

      <ReviewEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        approvalId={approval.id}
        review={review}
      />

      <SnapshotModal approval={approval} open={snapshotOpen} onClose={() => setSnapshotOpen(false)} />
    </div>
  );
}

function DerivedMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-faint">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-bold text-ink">{value}</p>
      <p className="text-[9px] text-faint">{hint}</p>
    </div>
  );
}

function EditorialBlock({
  label,
  children,
  tone = 'default',
}: {
  label: string;
  children: ReactNode;
  tone?: 'default' | 'inference' | 'caution';
}) {
  return (
    <section>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-faint">{label}</p>
      <div
        className={
          tone === 'inference'
            ? 'mt-1.5 rounded-[10px] border-l-2 border-[#9fb3cd] bg-[#f7faff] px-3 py-2 text-[12px] leading-6 text-[#2b4b72]'
            : tone === 'caution'
              ? 'mt-1.5 rounded-[10px] border-l-2 border-[#e2c88f] bg-[#fdfaf2] px-3 py-2 text-[12px] leading-6 text-[#7b5718]'
              : 'mt-1.5 text-[12px] leading-6 text-ink'
        }
      >
        {children}
      </div>
    </section>
  );
}

function QualityRow({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'mint' | 'warning' }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[11px] text-muted">{label}</span>
      <Tag tone={tone}>{value}</Tag>
    </div>
  );
}

function missingFields(review: Review | undefined, plan: Plan): string {
  if (!review) return '全部字段';
  const channels = plan.channels.map((channel) => review.channels.find((item) => item.channel === channel.channel));
  const missing = channels.reduce((count, channel) => {
    if (!channel) return count + 4;
    return (
      count +
      [channel.actualSpendCents, channel.impressions, channel.clicks, channel.leads].filter(
        (value) => value === null,
      ).length
    );
  }, 0);
  return missing === 0 ? '无' : `${missing} 个`;
}

function MoneyCell({
  value,
  label,
  onCommit,
}: {
  value: number | null;
  label: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value / 100));
  const focused = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value / 100));
  }, [value]);

  return (
    <div>
      <input
        aria-label={label}
        className="input input-number !h-8 !w-[92px] !px-2 !py-1 !text-[11px]"
        inputMode="decimal"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === '') {
            setError('');
            onCommit(null);
            return;
          }
          const parsed = parseYuanToCents(next);
          if (!parsed.ok) {
            setError(parsed.message);
            return;
          }
          setError('');
          onCommit(parsed.cents);
        }}
        onBlur={() => {
          focused.current = false;
          if (text.trim() === '') return;
          const parsed = parseYuanToCents(text);
          if (!parsed.ok) {
            setText(value === null ? '' : String(value / 100));
            setError('');
          }
        }}
      />
      {error ? <p className="mt-0.5 text-[9px] text-danger">{error}</p> : null}
    </div>
  );
}

function CountCell({
  value,
  label,
  onCommit,
}: {
  value: number | null;
  label: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const focused = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : String(value));
  }, [value]);

  return (
    <div>
      <input
        aria-label={label}
        className="input input-number !h-8 !w-[84px] !px-2 !py-1 !text-[11px]"
        inputMode="numeric"
        value={text}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next.trim() === '') {
            setError('');
            onCommit(null);
            return;
          }
          const parsed = parseWholeNumber(next);
          if (parsed === null) {
            setError('需非负整数');
            return;
          }
          setError('');
          onCommit(parsed);
        }}
        onBlur={() => {
          focused.current = false;
          if (text.trim() === '') return;
          if (parseWholeNumber(text) === null) {
            setText(value === null ? '' : String(value));
            setError('');
          }
        }}
      />
      {error ? <p className="mt-0.5 text-[9px] text-danger">{error}</p> : null}
    </div>
  );
}

function ReviewEditModal({
  open,
  onClose,
  approvalId,
  review,
}: {
  open: boolean;
  onClose: () => void;
  approvalId: string;
  review?: Review;
}) {
  const data = useAppStore((state) => state);
  const [form, setForm] = useState({
    observations: '',
    possibleReasons: '',
    unconfirmed: '',
    note: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        observations: review?.observations ?? '',
        possibleReasons: review?.possibleReasons ?? '',
        unconfirmed: review?.unconfirmed ?? '',
        note: review?.note ?? '',
      });
    }
  }, [open, review]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑复盘结论"
      description="事实、推测与待确认信息分开记录；保存后立即更新本页。"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              data.updateReviewFields(approvalId, form);
              toast('复盘结论已保存', '备注与结论已写入当前审批快照的复盘记录。', 'success');
              onClose();
            }}
          >
            保存复盘
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="观察到的结果" htmlFor="review-observations" hint="只写数据能直接支持的事实。">
          <textarea
            id="review-observations"
            className="textarea"
            rows={3}
            value={form.observations}
            onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
          />
        </Field>
        <Field label="可能原因（明确标注为推测）" htmlFor="review-reasons">
          <textarea
            id="review-reasons"
            className="textarea"
            rows={3}
            value={form.possibleReasons}
            onChange={(event) => setForm((current) => ({ ...current, possibleReasons: event.target.value }))}
          />
        </Field>
        <Field label="当前无法确认的判断" htmlFor="review-unconfirmed">
          <textarea
            id="review-unconfirmed"
            className="textarea"
            rows={3}
            value={form.unconfirmed}
            onChange={(event) => setForm((current) => ({ ...current, unconfirmed: event.target.value }))}
          />
        </Field>
        <Field label="复盘备注" htmlFor="review-note">
          <textarea
            id="review-note"
            className="textarea"
            rows={2}
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}

function SnapshotModal({
  approval,
  open,
  onClose,
}: {
  approval: {
    id: string;
    planCode: string;
    approvedAt: string;
    reason: string;
    companyBudgetCents: number;
    fingerprint: string;
    evidenceSignalIds: string[];
    plan: Plan;
  };
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="原始方案快照"
      description="复盘始终关联确认当时的方案与预算，不随后续编辑而变化。"
      size="lg"
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-[11px] border border-line px-3 py-2">
            <p className="text-[10px] text-faint">快照 ID</p>
            <p className="tabular mt-0.5 text-[12px] font-bold text-ink">{approval.id}</p>
          </div>
          <div className="rounded-[11px] border border-line px-3 py-2">
            <p className="text-[10px] text-faint">确认时间</p>
            <p className="mt-0.5 text-[11px] font-semibold text-ink">{formatDateTime(approval.approvedAt)}</p>
          </div>
          <div className="rounded-[11px] border border-line px-3 py-2">
            <p className="text-[10px] text-faint">预算上限</p>
            <p className="tabular mt-0.5 text-[12px] font-bold text-ink">{formatCny(approval.companyBudgetCents)}</p>
          </div>
        </div>
        <div className="rounded-[12px] border border-line bg-[#fbfcfd] p-4">
          <p className="text-[13px] font-bold text-ink">
            方案 {approval.planCode} · {approval.plan.name}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted">{approval.plan.positioning}</p>
          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {approval.plan.channels.map((channel) => (
              <div key={channel.channel} className="flex items-center justify-between rounded-[8px] bg-white px-2.5 py-1.5">
                <span className="text-[10px] text-muted">{channel.channel}</span>
                <span className="tabular text-[11px] font-semibold text-ink">{formatCny(channel.budgetCents)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">确认理由</p>
          <p className="mt-1 rounded-[10px] bg-[#f8fafb] px-3 py-2 text-[12px] leading-5 text-ink">{approval.reason}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[11px] border border-line px-3 py-2">
            <p className="text-[10px] text-faint">关联证据</p>
            <p className="tabular mt-0.5 text-[13px] font-bold text-ink">{approval.evidenceSignalIds.length} 条</p>
            <p className="mt-1 text-[9px] leading-4 text-faint">{approval.evidenceSignalIds.join('、')}</p>
          </div>
          <div className="rounded-[11px] border border-line px-3 py-2">
            <p className="text-[10px] text-faint">输入指纹</p>
            <p className="tabular mt-0.5 break-all text-[10px] font-semibold text-ink">{approval.fingerprint}</p>
          </div>
        </div>
        <InfoBanner tone="neutral">
          快照为不可变副本。若企业预算、方案内容或关键情报状态变化，系统会提示重新确认。
        </InfoBanner>
      </div>
    </Modal>
  );
}
