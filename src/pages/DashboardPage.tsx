import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import {
  campaignProgress,
  computeReviewMetrics,
  getApprovalHealth,
  getReviewForApproval,
  signalStats,
  signalTrend,
  statusLabel,
  topSignals,
  totalPlanCents,
} from '@/lib/calculations';
import { formatCny, formatDate, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { StageProgress } from '@/components/ui/Progress';
import { SignalTrendChart } from '@/components/charts/SignalTrendChart';

export function DashboardPage() {
  const data = useAppStore((state) => state);
  const navigate = useNavigate();
  const openCompany = useUiStore((state) => state.openCompanyDrawer);
  const progress = campaignProgress(data);
  const health = getApprovalHealth(data);
  const stats = signalStats(data.signals);
  const approval =
    health.state === 'valid' || health.state === 'needs-reconfirm' ? health.approval : undefined;
  const review = approval ? getReviewForApproval(data, approval.id) : undefined;
  const metrics = approval
    ? computeReviewMetrics(totalPlanCents(approval.plan), review?.channels ?? [])
    : undefined;
  const openTasks = data.feedbackTasks.filter((task) => task.status === 'open');

  return (
    <div className="page-wrap dashboard-page">
      <PageHeader
        title="营销工作台"
        description={`${data.company.product} · ${data.company.campaignStart} — ${data.company.campaignEnd}`}
        actions={<Button onClick={openCompany}>修改企业与预算</Button>}
      />
      <section className="campaign-brief" aria-label="当前营销目标">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{data.company.brand} · 本轮目标</p>
          <h2 className="mt-2 text-xl font-semibold leading-relaxed text-ink">
            {data.company.goal}
          </h2>
          <p className="mt-2 text-sm text-muted">{progress.phaseDetail}</p>
        </div>
        <Button variant="primary" onClick={() => navigate(progress.nextAction.to)}>
          {progress.nextAction.label} →
        </Button>
      </section>
      <section className="metric-strip" aria-label="营销概览">
        {[
          {
            label: '预算上限 / 元',
            value: formatCny(data.company.budgetCents).replace('¥', ''),
            note: '修改后各页面同步',
            to: openCompany,
          },
          {
            label: '市场情报 / 条',
            value: formatNumber(stats.total),
            note: `${stats.platforms.length} 个${data.mode === "real" ? "" : "模拟"}平台来源`,
            to: () => navigate('/signals'),
          },
          {
            label: '重点信号 / 条',
            value: formatNumber(stats.high),
            note: `${stats.pending} 条情报待核实`,
            to: () => navigate('/signals'),
          },
          {
            label: '待补任务 / 项',
            value: String(openTasks.length),
            note: '来自导入核对与效果复盘',
            to: () => navigate('/signals?tasks=open'),
          },
        ].map((item) => (
          <button key={item.label} type="button" className="metric-item" onClick={item.to}>
            <span className="text-sm text-muted">{item.label}</span>
            <span className="kpi-number mt-3 block">{item.value}</span>
            <span className="mt-3 block text-xs text-muted">{item.note}</span>
          </button>
        ))}
      </section>
      <div className="dashboard-analysis">
        <SignalTrendChart
          points={signalTrend(data.signals, 10)}
          onSelectDate={(date) => navigate(`/signals?date=${date}`)}
          subtitle="每个点对应当天收集的情报，点击日期查看记录"
        />
        <section className="quiet-section">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">值得关注的信号</h2>
            <button className="text-sm text-brand" onClick={() => navigate('/signals')}>
              全部 →
            </button>
          </div>
          <div className="mt-4 divide-y divide-line">
            {topSignals(data.signals, 3).map((signal) => (
              <button
                type="button"
                key={signal.id}
                onClick={() => navigate(`/signals?focus=${signal.id}`)}
                className="signal-preview"
              >
                <span className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {signal.id} · {signal.platform}
                  </span>
                  <Tag tone={signal.status === 'verified' ? 'neutral' : 'warning'}>
                    {statusLabel[signal.status]}
                  </Tag>
                </span>
                <span className="mt-2 block text-sm font-semibold leading-6">{signal.title}</span>
                <span className="mt-2 block text-xs text-muted">
                  {formatDate(signal.capturedAt)} · 查看证据 →
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="quiet-section mt-8 border-t border-line pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">本轮进展</h2>
          <Tag tone={health.state === 'needs-reconfirm' ? 'warning' : 'neutral'}>
            {progress.phase}
          </Tag>
        </div>
        <div className="mt-6">
          <StageProgress stages={progress.stages} />
        </div>
        {health.state === 'needs-reconfirm' ? (
          <p className="mt-5 text-sm text-[#8a5a12]">
            {health.reasons.join('；')}。请到策略页重新确认，旧快照保留。
          </p>
        ) : null}
        <div className="mt-6 grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">当前营销方案</p>
            <p className="mt-2 text-sm font-semibold">
              {approval ? `${approval.planCode} · ${approval.plan.name}` : '等待人工确认'}
            </p>
            <button className="mt-2 text-sm text-brand" onClick={() => navigate('/strategy')}>
              比较方案与查看依据 →
            </button>
          </div>
          <div>
            <p className="text-xs text-muted">最近复盘 · {review?.dataKind === "manual" ? "人工录入" : "模拟输入"}</p>
            <p className="mt-2 text-sm">
              {metrics
                ? `实际花费 ${formatCny(metrics.actualSpendCents)} · 有效咨询 ${formatNumber(metrics.leads)} 条`
                : '确认方案后可填写本轮效果'}
            </p>
            <button className="mt-2 text-sm text-brand" onClick={() => navigate('/review')}>
              查看复盘与下一轮任务 →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
