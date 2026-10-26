import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  FileText,
  PencilLine,
  Radar,
  Upload,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import {
  campaignProgress,
  computeReviewMetrics,
  getApprovalHealth,
  getReviewForApproval,
  priorityLabel,
  signalStats,
  signalTrend,
  statusLabel,
  topSignals,
  totalPlanCents,
} from '@/lib/calculations';
import { formatCny, formatDate, formatNumber } from '@/lib/format';
import { PageHeader, DemoBadge, MetaItem } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { InfoBanner } from '@/components/ui/Form';
import { ProgressBar, StageProgress } from '@/components/ui/Progress';
import { SignalTrendChart } from '@/components/charts/SignalTrendChart';
import { SparkBars } from '@/components/charts/Spark';

export function DashboardPage() {
  const data = useAppStore((state) => state);
  const navigate = useNavigate();
  const openCompany = useUiStore((state) => state.openCompanyDrawer);
  const openImport = useUiStore((state) => state.openImportModal);

  const progress = campaignProgress(data);
  const health = getApprovalHealth(data);
  const stats = signalStats(data.signals);
  const trend = signalTrend(data.signals, 21);
  const top = topSignals(data.signals, 3);
  const activeApproval =
    health.state === 'valid' || health.state === 'needs-reconfirm' ? health.approval : undefined;
  const review = activeApproval ? getReviewForApproval(data, activeApproval.id) : undefined;
  const reviewMetrics = activeApproval
    ? computeReviewMetrics(totalPlanCents(activeApproval.plan), review?.channels ?? [])
    : null;
  const pendingPlans = data.plans.filter(
    (plan) => plan.id !== data.decision.planId || health.state === 'needs-reconfirm',
  );
  const allocatedPlan = data.plans.find((plan) => plan.id === data.decision.planId);
  const highPending = data.signals.filter(
    (signal) => signal.priority === 'high' && signal.status === 'pending',
  ).length;

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="早上好，欢迎回来"
        title="本周营销工作台"
        description={`${data.company.brand}正围绕「${data.company.product}」推进一轮 ${
          data.company.campaignStart === data.company.campaignEnd
            ? '单日'
            : '一周'
        }营销任务。目标是${data.company.goal}。所有判断都能回到可追溯的市场情报。`}
        meta={
          <>
            <MetaItem label="当前企业" value={data.company.brand} />
            <MetaItem label="本轮周期" value={`${data.company.campaignStart} — ${data.company.campaignEnd}`} />
            <MetaItem label="预算上限" value={formatCny(data.company.budgetCents)} />
            <DemoBadge />
          </>
        }
        actions={
          <>
            <Button icon={<PencilLine size={14} />} onClick={openCompany}>
              修改企业资料
            </Button>
            <Button variant="primary" icon={<Upload size={14} />} onClick={openImport}>
              导入数据
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="本轮营销预算"
          value={formatCny(data.company.budgetCents).replace('¥', '')}
          unit="元"
          tone="navy"
          badge={<Tag tone="outline">上限</Tag>}
          note={
            allocatedPlan ? (
              <>
                方案 {allocatedPlan.code} 已分配{' '}
                <span className="tabular font-semibold text-ink">{formatCny(totalPlanCents(allocatedPlan))}</span>
                ，上限变更后需重新校验。
              </>
            ) : (
              '尚未分配方案预算'
            )
          }
          footer={
            <div className="mt-2">
              <ProgressBar
                value={
                  allocatedPlan
                    ? Math.min(100, (totalPlanCents(allocatedPlan) / Math.max(1, data.company.budgetCents)) * 100)
                    : 0
                }
                tone="navy"
                label="方案预算占上限比例"
              />
            </div>
          }
        />
        <MetricCard
          label="已收集市场信息"
          value={formatNumber(stats.total)}
          unit="条"
          tone="mint"
          badge={<Tag tone="mint">{stats.platforms.length} 个来源</Tag>}
          note={`已核实 ${stats.verified} 条 · 最近更新 ${formatDate(stats.latest, true)}`}
          spark={<SparkBars values={trend.map((point) => point.total)} tone="mint" label="每日情报数量" />}
        />
        <MetricCard
          label="重点市场信号"
          value={formatNumber(stats.high)}
          unit="条"
          badge={<Tag tone="hero">高优先级</Tag>}
          note={`其中 ${highPending} 条仍待核实；有争议 ${stats.disputed} 条`}
          spark={<SparkBars values={trend.map((point) => point.high)} tone="hero" label="每日高优先级情报" />}
        />
        <MetricCard
          label="待确认营销建议"
          value={formatNumber(pendingPlans.length)}
          unit="项"
          tone="terracotta"
          badge={<Tag tone="warning">人工确认</Tag>}
          note={
            health.state === 'needs-reconfirm'
              ? '当前方案依据发生变化，需要重新确认。'
              : pendingPlans.length > 0
                ? `方案 ${pendingPlans.map((plan) => plan.code).join('、')} 尚未确认，确认后才可进入复盘。`
                : '所有方案均已确认。'
          }
          footer={
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
              onClick={() => navigate('/strategy')}
            >
              去比较方案 <ArrowRight size={12} />
            </button>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SignalTrendChart
            points={trend}
            onSelectDate={(date) => navigate(`/signals?date=${date}`)}
            subtitle="按捕获日期逐日记录近期市场信号；点击某一天可在情报页查看当日记录"
          />
        </div>
        <Card className="flex flex-col lg:col-span-4" padded={false}>
          <div className="border-b border-line px-5 pb-4 pt-5">
            <SectionHeader
              title="本周最值得关注"
              description="按优先级、相关性与时间排序的三个信号"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/signals')}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  全部 <ArrowUpRight size={12} />
                </button>
              }
            />
          </div>
          <div className="divide-y divide-line">
            {top.map((signal, index) => {
              const source = data.sources.find((item) => item.id === signal.sourceId);
              return (
                <button
                  key={signal.id}
                  type="button"
                  onClick={() => navigate(`/signals?focus=${signal.id}`)}
                  className="group block w-full px-5 py-4 text-left transition-colors hover:bg-[#fbfcfd]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular text-[10px] font-bold text-faint">0{index + 1}</span>
                    <div className="flex items-center gap-1.5">
                      <Tag tone={signal.priority === 'high' ? 'hero' : 'neutral'}>
                        {priorityLabel[signal.priority]}优先级
                      </Tag>
                      <Tag tone={signal.status === 'pending' ? 'warning' : 'mint'}>
                        {statusLabel[signal.status]}
                      </Tag>
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold leading-5 text-ink group-hover:text-brand">
                    {signal.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{signal.impact}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-faint">
                    <span>{source?.platform ?? signal.platform}</span>
                    <span>·</span>
                    <span>{formatDate(signal.capturedAt)}</span>
                    <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
                      查看证据 <ArrowRight size={11} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow mb-1.5">当前营销任务</div>
              <h2 className="section-title">从情报到复盘的执行状态</h2>
            </div>
            <Tag
              tone={
                health.state === 'valid'
                  ? 'mint'
                  : health.state === 'needs-reconfirm'
                    ? 'warning'
                    : health.state === 'hold'
                      ? 'neutral'
                      : 'brand'
              }
              dot
            >
              {progress.phase}
            </Tag>
          </div>

          <p className="mt-2 text-[12px] leading-5 text-muted">{progress.phaseDetail}</p>

          <div className="mt-4 grid gap-3 rounded-[14px] border border-line bg-[#fbfcfd] p-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-medium text-faint">营销目标</p>
              <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink">{data.company.goal}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-faint">产品</p>
              <p className="mt-1 text-[12px] leading-5 text-ink">{data.company.product}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-faint">预算上限</p>
              <p className="mt-1 tabular text-[15px] font-bold text-ink">{formatCny(data.company.budgetCents)}</p>
            </div>
          </div>

          <div className="mt-5">
            <StageProgress stages={progress.stages} />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-[10px] font-medium text-faint">下一项操作</p>
              <p className="mt-0.5 text-[12px] font-semibold text-ink">{progress.nextAction.hint}</p>
            </div>
            <Button
              variant="primary"
              icon={<ArrowRight size={14} />}
              onClick={() => navigate(progress.nextAction.to)}
            >
              {progress.nextAction.label}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="eyebrow mb-1.5">审批状态</div>
              <h2 className="section-title">当前方案依据</h2>
            </div>
            <ClipboardList size={18} className="text-faint" />
          </div>
          {health.state === 'valid' ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-[12px] bg-[var(--accent-mint-soft)] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <Tag tone="mint" dot>
                    审批有效
                  </Tag>
                  <span className="tabular text-[10px] text-muted">{health.approval.id}</span>
                </div>
                <p className="mt-2 text-[12px] font-semibold text-ink">
                  方案 {health.approval.planCode} · {health.approval.plan.name}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  已确认于 {formatDate(health.approval.approvedAt, true)}，快照记录了预算与关键证据状态。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[10px] text-faint">方案总预算</p>
                  <p className="tabular mt-0.5 text-[15px] font-bold text-ink">
                    {formatCny(totalPlanCents(health.approval.plan))}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[10px] text-faint">关联证据</p>
                  <p className="tabular mt-0.5 text-[15px] font-bold text-ink">
                    {health.approval.evidenceSignalIds.length} 条
                  </p>
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate('/strategy?view=approval')}>
                查看审批快照
              </Button>
            </div>
          ) : health.state === 'needs-reconfirm' ? (
            <div className="mt-4">
              <InfoBanner tone="warning" title="需要重新确认">
                {health.reasons.join('；')}。进入策略页查看变化并生成新的审批快照。
              </InfoBanner>
              <Button className="mt-3 w-full" variant="primary" onClick={() => navigate('/strategy')}>
                重新确认方案
              </Button>
            </div>
          ) : health.state === 'hold' ? (
            <div className="mt-4">
              <InfoBanner tone="neutral" title="本轮暂不投放">
                {health.reason}
              </InfoBanner>
              <Button className="mt-3 w-full" onClick={() => navigate('/strategy')}>
                恢复方案选择
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <InfoBanner tone="brand" title="尚未确认方案">
                请先比较 A/B 方案、调整预算并完成人工确认。未确认前不生成复盘结论。
              </InfoBanner>
              <Button className="mt-3 w-full" variant="primary" onClick={() => navigate('/strategy')}>
                继续营销决策
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <SectionHeader
            eyebrow="最近方案"
            title={activeApproval ? `方案 ${activeApproval.planCode} · ${activeApproval.plan.name}` : '尚未确认方案'}
            description={
              activeApproval
                ? activeApproval.plan.positioning
                : '比较两套候选方案，确认预算与证据后进入复盘。'
            }
            action={
              <Button size="sm" onClick={() => navigate('/strategy')} icon={<ArrowRight size={13} />}>
                查看决策
              </Button>
            }
          />
          {activeApproval ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {activeApproval.plan.channels.map((channel) => (
                <div key={channel.channel} className="rounded-[12px] border border-line bg-[#fbfcfd] p-3">
                  <p className="text-[10px] text-faint">{channel.channel}</p>
                  <p className="tabular mt-1 text-[17px] font-bold text-ink">{formatCny(channel.budgetCents)}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted">{channel.role}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[12px] border border-dashed border-line p-5 text-center text-[12px] text-muted">
              方案 A 偏内容种草，方案 B 偏同城转化；确认后可在此查看渠道分配。
            </div>
          )}
          {activeApproval ? (
            <>
              <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint">目标消费者</p>
                  <p className="mt-1 text-[11px] leading-5 text-ink">{activeApproval.plan.audience}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint">核心信息</p>
                  <p className="mt-1 text-[11px] font-medium leading-5 text-ink">“{activeApproval.plan.coreMessage}”</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint">关键约束</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {activeApproval.plan.constraints.map((constraint) => (
                      <Tag key={constraint} tone="outline">
                        {constraint}
                      </Tag>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <p className="text-[10px] text-faint">
                  预算合计{' '}
                  <span className="tabular font-semibold text-ink">
                    {formatCny(totalPlanCents(activeApproval.plan))}
                  </span>{' '}
                  / 上限 {formatCny(data.company.budgetCents)}
                </p>
                <span className="text-[10px] text-muted">所有估算均为演示假设，不构成效果承诺</span>
              </div>
            </>
          ) : null}
        </Card>

        <Card className="lg:col-span-5">
          <SectionHeader
            eyebrow="最近反馈"
            title="本轮复盘摘要"
            description={review ? '演示投放结果，仅用于展示指标计算与复盘流程。' : '尚未录入实际投放数据。'}
            action={<DemoBadge />}
          />
          {reviewMetrics && reviewMetrics.actualSpendCents !== null ? (
            <div className="mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[10px] text-faint">实际花费</p>
                  <p className="tabular mt-0.5 text-[15px] font-bold text-ink">
                    {formatCny(reviewMetrics.actualSpendCents)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[10px] text-faint">有效咨询</p>
                  <p className="tabular mt-0.5 text-[15px] font-bold text-ink">
                    {formatNumber(reviewMetrics.leads)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-line px-3 py-2">
                  <p className="text-[10px] text-faint">咨询成本</p>
                  <p className="tabular mt-0.5 text-[15px] font-bold text-ink">
                    {formatCny(reviewMetrics.costPerLeadCents, 2)}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-[11px] bg-[#f8fafb] px-3.5 py-3">
                <p className="text-[10px] font-semibold text-faint">观察到</p>
                <p className="mt-1 line-clamp-3 text-[11px] leading-5 text-muted">{review?.observations}</p>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-faint">
                  <FileText size={12} /> 数据截至 {formatDate(review?.updatedAt, true)}
                </span>
                <Button size="sm" variant="primary" onClick={() => navigate('/review')}>
                  查看复盘 <ArrowRight size={12} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-[12px] border border-dashed border-line p-5">
              <p className="text-[12px] leading-5 text-muted">
                确认方案后，在复盘页按渠道录入实际花费、曝光、点击与有效咨询，图表会自动更新。
              </p>
              <Button size="sm" variant="mint" onClick={() => navigate('/review')}>
                去录入结果
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-white/60 px-4 py-3">
        <p className="text-[10px] leading-5 text-muted">
          <span className="font-semibold text-ink">演示边界：</span>
          本页不包含真实平台采集、真实大模型调用或广告预测。所有企业、竞品、消费者评价与投放结果均为虚构演示。
        </p>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-faint">
          <Radar size={12} /> 数据来自本地模拟用户操作
        </span>
      </div>
    </div>
  );
}
