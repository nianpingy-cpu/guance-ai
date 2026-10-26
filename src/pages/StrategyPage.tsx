import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  PencilLine,
  Printer,
  Save,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type { Plan } from '@/types/domain';
import { useAppStore } from '@/store/appStore';
import { toast } from '@/store/toast';
import {
  checkPlanBudget,
  getApprovalHealth,
  getLatestApproval,
  planEvidenceIds,
  priorityLabel,
  statusLabel,
  totalPlanCents,
} from '@/lib/calculations';
import { formatCny, formatDate, formatDateTime, parseYuanToCents } from '@/lib/format';
import { PageHeader, DemoBadge, MetaItem } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Field, InfoBanner } from '@/components/ui/Form';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { ThemeRankChart } from '@/components/charts/ThemeRankChart';
import { EvidenceQualityChart } from '@/components/charts/EvidenceQualityChart';
import { BudgetAllocationChart } from '@/components/charts/BudgetAllocationChart';
import { ProgressBar } from '@/components/ui/Progress';

export function StrategyPage() {
  const data = useAppStore((state) => state);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const health = getApprovalHealth(data);
  const [selectedThemeId, setSelectedThemeId] = useState(data.themes[0]?.id ?? '');
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [successApprovalId, setSuccessApprovalId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [holdReason, setHoldReason] = useState('等待补充企业团购产能与资质信息后再投放。');
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [budgetError, setBudgetError] = useState('');
  const [approvalDeepLinkHandled, setApprovalDeepLinkHandled] = useState(false);

  const activePlan = data.plans.find((plan) => plan.id === data.activePlanId) ?? data.plans[0];
  const selectedTheme = data.themes.find((theme) => theme.id === selectedThemeId) ?? data.themes[0];
  const selectedThemeSignals = data.signals.filter((signal) =>
    selectedTheme?.evidenceSignalIds.includes(signal.id),
  );
  const currentApproval =
    health.state === 'valid' || health.state === 'needs-reconfirm'
      ? health.approval
      : activePlan
        ? getLatestApproval(data.approvals, activePlan.id)
        : undefined;
  const evidenceIds = activePlan ? planEvidenceIds(activePlan, data) : [];
  const evidenceSignals = data.signals.filter((signal) => evidenceIds.includes(signal.id));
  const evidencePeriod = (() => {
    const dates = data.signals.map((signal) => signal.capturedAt).sort();
    return dates.length ? `${formatDate(dates[0], true)} — ${formatDate(dates[dates.length - 1], true)}` : '暂无';
  })();

  useEffect(() => {
    setBudgetInputs(
      Object.fromEntries(
        (activePlan?.channels ?? []).map((channel) => [channel.channel, String(channel.budgetCents / 100)]),
      ),
    );
    setBudgetError('');
  }, [activePlan?.id, activePlan?.updatedAt]);

  const approvalKey =
    health.state === 'valid' || health.state === 'needs-reconfirm'
      ? `${health.approval.id}:${health.state}`
      : health.state;
  useEffect(() => {
    if (health.state === 'valid' || health.state === 'needs-reconfirm') {
      setReason(health.approval.reason);
    }
    // Only reset when the approval identity/state changes, never while typing.
  }, [approvalKey]);

  useEffect(() => {
    if (approvalDeepLinkHandled || searchParams.get('view') !== 'approval') return;
    setApprovalDeepLinkHandled(true);
    if (health.state === 'valid' || health.state === 'needs-reconfirm') {
      setSnapshotOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    setSearchParams(next, { replace: true });
  }, [approvalDeepLinkHandled, health, searchParams, setSearchParams]);

  const localTotal = activePlan
    ? activePlan.channels.reduce((sum, channel) => {
        const parsed = parseYuanToCents(budgetInputs[channel.channel] ?? '');
        return sum + (parsed.ok ? parsed.cents : channel.budgetCents);
      }, 0)
    : 0;
  const cap = data.company.budgetCents;
  const overBy = Math.max(0, localTotal - cap);
  const budgetCheck = activePlan ? checkPlanBudget(activePlan, cap) : null;
  const canConfirm = Boolean(
    activePlan &&
      budgetCheck?.ok &&
      !budgetError &&
      localTotal <= cap &&
      reason.trim().length > 0 &&
      data.decision.status !== 'hold',
  );

  const changeBudget = (channel: string, value: string) => {
    if (!activePlan) return;
    setBudgetInputs((current) => ({ ...current, [channel]: value }));
    setBudgetError('');
    const parsed = parseYuanToCents(value);
    if (!parsed.ok) {
      setBudgetError(parsed.message);
      return;
    }
    const others = activePlan.channels
      .filter((item) => item.channel !== channel)
      .reduce((sum, item) => sum + item.budgetCents, 0);
    if (others + parsed.cents > cap) {
      setBudgetError(`合计预算不能超过上限，当前输入会使总额超出 ${formatCny(others + parsed.cents - cap)}`);
      return;
    }
    const result = data.updatePlanChannelBudget(activePlan.id, channel, parsed.cents);
    if (!result.ok) setBudgetError(result.message);
  };

  const openConfirm = () => {
    if (!activePlan) return;
    if (!canConfirm) {
      toast('暂不能确认方案', budgetError || budgetCheck?.message || '请先处理预算或状态问题', 'warning');
      return;
    }
    setConfirmOpen(true);
  };

  if (!activePlan) {
    return (
      <div className="page-wrap">
        <PageHeader title="洞察与策略" description="暂无方案数据，请恢复演示数据。" />
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <PageHeader
        title="洞察与策略"
        description="比较两套测试计划，核对依据后完成人工确认。"
        meta={
          <>
            <MetaItem label="证据总量" value={`${data.signals.length} 条`} />
            <MetaItem label="当前主题" value={selectedTheme?.title ?? '—'} />
            <MetaItem
              label="方案状态"
              value={
                health.state === 'valid'
                  ? `方案 ${health.approval.planCode} 已确认`
                  : health.state === 'needs-reconfirm'
                    ? '需要重新确认'
                    : health.state === 'hold'
                      ? '本轮暂不投放'
                      : '待确认'
              }
            />
            <DemoBadge />
          </>
        }
        actions={
          <>
            <Button variant="ghost" icon={<FileText size={14} />} onClick={() => setEvidenceOpen(true)}>
              查看依据
            </Button>
            <Button variant="ghost" icon={<Printer size={14} />} onClick={() => window.print()}>
              打印 / PDF
            </Button>
            <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => navigate('/review')}>
              前往复盘
            </Button>
          </>
        }
      />

      <div className="mb-3 mt-7 flex flex-wrap items-center gap-2">
        <span className="eyebrow">营销策略决策</span>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] text-faint">人工编辑 · 人工确认 · 快照可追溯</span>
      </div>

      {health.state === 'needs-reconfirm' ? (
        <InfoBanner
          tone="warning"
          className="mb-4"
          title="当前审批需要重新确认"
          action={<Tag tone="warning">状态已变化</Tag>}
        >
          {health.reasons.join('；')}。请检查预算与方案内容，确认后生成新的审批快照。旧快照仍保留用于追溯。
        </InfoBanner>
      ) : health.state === 'valid' ? (
        <InfoBanner
          tone="success"
          className="mb-4"
          title={`方案 ${health.approval.planCode} 已于 ${formatDateTime(health.approval.approvedAt)} 确认`}
          action={
            <Button size="sm" variant="ghost" onClick={() => setSnapshotOpen(true)}>
              查看审批快照
            </Button>
          }
        >
          快照 {health.approval.id} 已保存方案、预算上限与 {health.approval.evidenceSignalIds.length} 条关键证据状态。进入复盘页即可录入实际数据。
        </InfoBanner>
      ) : health.state === 'hold' ? (
        <InfoBanner
          tone="neutral"
          className="mb-4"
          title="本轮暂不投放"
          action={
            <Button size="sm" onClick={() => {
              data.resumePlanSelection();
              toast('已恢复方案选择', '可以重新比较 A/B 方案并确认。', 'success');
            }}>
              恢复方案选择
            </Button>
          }
        >
          {health.reason}。已确认的历史快照与复盘记录仍保留。
        </InfoBanner>
      ) : (
        <InfoBanner
          tone="brand"
          className="mb-4"
          title="方案尚未确认"
          action={<Tag tone="brand">待人工确认</Tag>}
        >
          选择一套方案、调整渠道预算并填写确认理由后，系统会保存审批快照。确认前不会生成复盘结论。
        </InfoBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            active={plan.id === activePlan.id}
            decisionPlanId={data.decision.planId}
            healthState={health.state}
            onSelect={() => data.selectPlan(plan.id)}
            onEdit={() => setEditingPlanId(plan.id)}
            onViewEvidence={() => {
              data.selectPlan(plan.id);
              setEvidenceOpen(true);
            }}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <BudgetAllocationChart
            plans={data.plans}
            capCents={cap}
            selectedPlanId={activePlan.id}
            onSelectPlan={(id) => data.selectPlan(id)}
          />
        </div>
        <Card className="lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="eyebrow mb-1">预算编辑</div>
              <h2 className="section-title">方案 {activePlan.code} 渠道预算</h2>
            </div>
            <Tag tone={overBy > 0 ? 'danger' : 'mint'} dot>
              {overBy > 0 ? '超出上限' : '预算合规'}
            </Tag>
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-muted">
            单位：元。修改后立即校验并更新图表；所有渠道合计不得超过企业预算上限。
          </p>

          <div className="mt-4 space-y-2.5">
            {activePlan.channels.map((channel) => (
              <div key={channel.channel} className="grid grid-cols-[1fr_124px] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink">{channel.channel}</p>
                  <p className="truncate text-[12px] text-faint">{channel.role}</p>
                </div>
                <div className="amount-input">
                  <input
                    aria-label={`${channel.channel}预算（元）`}
                    className="input input-number"
                    inputMode="decimal"
                    value={budgetInputs[channel.channel] ?? ''}
                    onChange={(event) => changeBudget(channel.channel, event.target.value)}
                  />
                  <span className="amount-unit">
                    元
                  </span>
                </div>
              </div>
            ))}
          </div>

          {budgetError ? <p className="error-text mt-2">{budgetError}</p> : null}

          <div className="mt-4 rounded-[12px] bg-[#f8fafb] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted">渠道合计</span>
              <span className={`tabular text-[18px] font-bold ${overBy > 0 ? 'text-danger' : 'text-ink'}`}>
                {formatCny(localTotal)}
              </span>
            </div>
            <div className="mt-2">
              <ProgressBar value={Math.min(100, (localTotal / Math.max(1, cap)) * 100)} tone={overBy > 0 ? 'hero' : 'data'} label="预算使用比例" />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[12px] text-faint">
              <span>企业上限 {formatCny(cap)}</span>
              <span>{overBy > 0 ? `超出 ${formatCny(overBy)}` : `剩余 ${formatCny(cap - localTotal)}`}</span>
            </div>
          </div>

          {overBy > 0 || activePlan.channels.reduce((sum, c) => sum + c.budgetCents, 0) > cap ? (
            <Button
              size="sm"
              className="mt-2"
              icon={<Scale size={13} />}
              onClick={() => {
                data.adjustPlanToCap(activePlan.id);
                setBudgetError('');
                toast('已按比例调整至上限', '可继续微调具体渠道。', 'success');
              }}
            >
              按比例调整至上限
            </Button>
          ) : null}

          <Field
            label="确认理由 / 修改说明"
            htmlFor="plan-reason"
            hint="审批快照会保存该理由；未填写不能确认。"
            className="mt-4"
          >
            <textarea
              id="plan-reason"
              className="textarea"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="例：优先验证礼盒体面感内容，预算控制在企业上限内。"
            />
          </Field>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon={<Save size={14} />}
              onClick={() =>
                budgetError || overBy > 0
                  ? toast('草稿未完全保存', budgetError || '请先将预算调整到企业上限内。', 'warning')
                  : toast('草稿已保存', '当前有效预算与方案内容已自动保存在本机浏览器。', 'success')
              }
            >
              保存草稿
            </Button>
            <Button icon={<FileText size={14} />} onClick={() => setEvidenceOpen(true)}>
              查看依据
            </Button>
            <Button variant="danger" onClick={() => setHoldOpen(true)}>
              暂不投放
            </Button>
            <Button
              variant="primary"
              className="ml-auto"
              icon={<ShieldCheck size={14} />}
              onClick={openConfirm}
              disabled={!canConfirm}
            >
              确认方案 {activePlan.code}
            </Button>
          </div>
          {!canConfirm ? (
            <p className="mt-2 text-[12px] text-faint">
              确认按钮不可用：请先满足预算上限、填写确认理由，并避免在本轮暂不投放状态下确认。
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-white/60 px-4 py-3">
        <p className="text-[12px] leading-5 text-muted">
          <span className="font-semibold text-ink">决策边界：</span>
          方案中的“推荐”是基于模拟证据的人工判断；不包含真实模型预测、增量效果估计或自动投放。
        </p>
        <span className="text-[12px] text-faint">确认后保存不可变快照，后续变更会提示重新确认</span>
      </div>

      <details className="disclosure mt-6"><summary>消费者主题、证据与竞品机会 · 预设模拟分析</summary><div className="pt-5">
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <ThemeRankChart
            themes={data.themes}
            selectedThemeId={selectedThemeId}
            onSelectTheme={setSelectedThemeId}
            periodLabel={evidencePeriod}
          />
          <details className="disclosure"><summary>查看证据质量结构</summary><EvidenceQualityChart
            themes={data.themes}
            signals={data.signals}
            selectedThemeId={selectedThemeId}
            onSelectTheme={setSelectedThemeId}
            periodLabel={evidencePeriod}
          /></details>
        </div>
        <div className="space-y-4 lg:col-span-5">
        <Card>
          {selectedTheme ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="eyebrow mb-1">主题 {selectedTheme.rank}</div>
                  <h2 className="section-title">{selectedTheme.title}</h2>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Tag tone={selectedTheme.confidence === 'high' ? 'mint' : selectedTheme.confidence === 'medium' ? 'warning' : 'neutral'}>
                    置信度{selectedTheme.confidence === 'high' ? '较高' : selectedTheme.confidence === 'medium' ? '中等' : '较低'}
                  </Tag>
                  <span className="text-[11px] text-faint">{selectedTheme.claimType}</span>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-6 text-muted">{selectedTheme.summary}</p>

              <div className="mt-4 rounded-[12px] border border-[#dce6f3] bg-[#f7faff] px-3.5 py-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#6b82a0]">营销机会推断</p>
                <p className="mt-1 text-[12px] leading-6 text-[#2b4b72]">{selectedTheme.opportunity}</p>
              </div>

              <div className="mt-3 rounded-[12px] border border-[#f0dfbd] bg-[#fdfaf2] px-3.5 py-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#99701d]">不确定性</p>
                <p className="mt-1 text-[11px] leading-5 text-[#7b5718]">{selectedTheme.caveat}</p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold text-ink">对应证据</p>
                  <span className="tabular text-[12px] text-faint">{selectedThemeSignals.length} 条</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {selectedThemeSignals.map((signal) => (
                    <button
                      key={signal.id}
                      type="button"
                      onClick={() => navigate(`/signals?focus=${signal.id}`)}
                      className="group flex w-full items-start gap-2 rounded-[10px] border border-line px-3 py-2 text-left transition-colors hover:border-[#c9d4e1] hover:bg-[#fbfcfd]"
                    >
                      <span className="tabular mt-0.5 shrink-0 text-[11px] text-faint">{signal.id}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold leading-5 text-ink group-hover:text-brand">
                          {signal.title}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                          <span>{signal.platform}</span>
                          <span>·</span>
                          <span>{priorityLabel[signal.priority]}优先级</span>
                          <span>·</span>
                          <span>{statusLabel[signal.status]}</span>
                        </span>
                      </span>
                      <ChevronRight size={12} className="mt-1 shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 text-[12px] font-semibold text-brand hover:underline"
                  onClick={() => navigate('/signals')}
                >
                  在情报页查看全部记录 →
                </button>
              </div>
            </>
          ) : null}
        </Card>

        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {data.opportunities.map((opportunity) => (
          <Card key={opportunity.id} className="flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <Tag tone={opportunity.tone === 'positive' ? 'mint' : opportunity.tone === 'caution' ? 'warning' : 'neutral'}>
                {opportunity.tone === 'caution' ? '需谨慎验证' : '机会'}
              </Tag>
              <span className="tabular text-[11px] text-faint">{opportunity.id}</span>
            </div>
            <h3 className="mt-2 text-[14px] font-bold leading-5 text-ink">{opportunity.title}</h3>
            <div className="mt-3 space-y-2.5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">观测事实</p>
                <p className="mt-0.5 text-[11px] leading-5 text-muted">{opportunity.fact}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#2e7d5b]">营销机会推断</p>
                <p className="mt-0.5 text-[11px] leading-5 text-ink">{opportunity.opportunity}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#99701d]">需要进一步核实</p>
                <p className="mt-0.5 text-[11px] leading-5 text-[#7b5718]">{opportunity.verify}</p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
              {opportunity.evidenceSignalIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(`/signals?focus=${id}`)}
                  className="tag tag-outline !px-2 !py-0.5 !text-[11px] transition-colors hover:text-brand"
                >
                  {id}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

</div></details>

      <PlanEditDrawer
        plan={editingPlanId ? data.plans.find((plan) => plan.id === editingPlanId) : undefined}
        onClose={() => setEditingPlanId(null)}
      />

      <Modal
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title={`方案 ${activePlan.code} 的证据依据`}
        description={`当前关联 ${evidenceSignals.length} 条情报。修改这些记录的优先级或状态会触发重新确认。`}
        size="lg"
        footer={<Button onClick={() => setEvidenceOpen(false)}>关闭</Button>}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {activePlan.evidenceThemeIds.map((id) => {
              const theme = data.themes.find((item) => item.id === id);
              return theme ? (
                <Tag key={id} tone="brand">
                  {theme.title}
                </Tag>
              ) : null;
            })}
          </div>
          <div className="space-y-2">
            {evidenceSignals.map((signal) => (
              <div key={signal.id} className="rounded-[11px] border border-line px-3.5 py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag tone={signal.priority === 'high' ? 'hero' : 'neutral'}>
                    {priorityLabel[signal.priority]}优先级
                  </Tag>
                  <Tag tone={signal.status === 'verified' ? 'mint' : signal.status === 'pending' ? 'warning' : 'danger'}>
                    {statusLabel[signal.status]}
                  </Tag>
                  <span className="tabular text-[11px] text-faint">{signal.id}</span>
                  <span className="ml-auto text-[11px] text-faint">{signal.platform}</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/signals?focus=${signal.id}`)}
                  className="mt-1.5 text-left text-[12px] font-semibold leading-5 text-ink hover:text-brand hover:underline"
                >
                  {signal.title}
                </button>
                <p className="mt-0.5 text-[12px] leading-5 text-muted">{signal.impact}</p>
              </div>
            ))}
          </div>
          <InfoBanner tone="neutral">
            证据为模拟数据，只用于展示“方案—证据—审批”的追溯关系，不代表真实市场结论。
          </InfoBanner>
        </div>
      </Modal>

      <ApprovalSnapshotModal
        open={snapshotOpen}
        onClose={() => setSnapshotOpen(false)}
        approval={currentApproval}
      />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`确认方案 ${activePlan.code}？`}
        description="确认后将保存一份审批快照，包含方案内容、渠道预算、预算上限与关键证据状态。"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>返回修改</Button>
            <Button
              variant="primary"
              icon={<Check size={14} />}
              onClick={() => {
                const result = data.confirmPlan(activePlan.id, reason);
                if (!result.ok) {
                  toast('确认失败', result.message, 'danger');
                  return;
                }
                setConfirmOpen(false);
                setSuccessApprovalId(result.approvalId);
                toast('方案已确认', '审批快照已保存，可进入复盘录入实际数据。', 'success');
              }}
            >
              确认并保存快照
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[13px] border border-line bg-[#fbfcfd] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[12px] text-faint">方案</p>
                <p className="mt-0.5 text-[14px] font-bold text-ink">
                  {activePlan.code} · {activePlan.name}
                </p>
              </div>
              <Tag tone="brand">预算 {formatCny(totalPlanCents(activePlan))}</Tag>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {activePlan.channels.map((channel) => (
                <div key={channel.channel} className="flex items-center justify-between rounded-[9px] bg-white px-3 py-2">
                  <span className="text-[11px] text-muted">{channel.channel}</span>
                  <span className="tabular text-[12px] font-semibold text-ink">{formatCny(channel.budgetCents)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-faint">确认理由</p>
            <p className="mt-1 rounded-[10px] bg-[#f8fafb] px-3 py-2 text-[12px] leading-5 text-ink">{reason || '未填写'}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">关联证据</p>
              <p className="tabular mt-0.5 text-[15px] font-bold text-ink">{evidenceSignals.length} 条</p>
            </div>
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">预算校验</p>
              <p className="mt-0.5 text-[12px] font-semibold text-success">未超过 {formatCny(cap)}</p>
            </div>
          </div>
          <InfoBanner tone="warning">
            这是人工确认的模拟方案，不是自动投放指令。系统不会向任何广告平台提交预算或素材。
          </InfoBanner>
        </div>
      </Modal>

      <Modal
        open={holdOpen}
        onClose={() => setHoldOpen(false)}
        title="本轮暂不投放"
        description="如果你判断当前证据不足或预算不合适，可以暂停本轮投放。历史审批与复盘记录仍会保留。"
        footer={
          <>
            <Button onClick={() => setHoldOpen(false)}>取消</Button>
            <Button
              variant="danger"
              disabled={!holdReason.trim()}
              onClick={() => {
                const result = data.holdCampaign(holdReason);
                if (!result.ok) {
                  toast('操作失败', result.message, 'danger');
                  return;
                }
                setHoldOpen(false);
                toast('已暂停本轮投放', '原因已保存，可在策略页恢复方案选择。', 'warning');
              }}
            >
              确认暂不投放
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-3 text-[12px] leading-6 text-muted">
            <p>暂停后，工作台会显示“本轮暂不投放”，复盘页不再提供新的实际数据录入入口。</p>
            <p>这不会删除已确认的方案快照；恢复方案选择后可以重新确认。</p>
          </div>
          <Field label="暂不投放原因" htmlFor="hold-reason" hint="原因会记录在本地决策状态中。">
            <textarea
              id="hold-reason"
              className="textarea"
              rows={3}
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(successApprovalId)}
        onClose={() => setSuccessApprovalId(null)}
        title="审批快照已保存"
        description="方案进入可执行状态。下一步可以在复盘页录入各渠道实际数据。"
        footer={
          <>
            <Button onClick={() => setSuccessApprovalId(null)}>继续调整</Button>
            <Button variant="primary" icon={<ArrowRight size={14} />} onClick={() => navigate('/review')}>
              进入效果复盘
            </Button>
          </>
        }
      >
        <div className="rounded-[14px] border border-[#cfe9dc] bg-[#f2faf6] p-4">
          <div className="flex items-center gap-2">
            <Check size={18} className="text-success" />
            <p className="text-[13px] font-bold text-ink">审批快照 {successApprovalId}</p>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted">
            快照已记录方案 {activePlan.code} 的渠道预算、确认理由与 {evidenceSignals.length} 条证据状态。若后续修改企业预算或关键情报，状态会变为“需要重新确认”。
          </p>
        </div>
      </Modal>
    </div>
  );
}

function PlanCard({
  plan,
  active,
  decisionPlanId,
  healthState,
  onSelect,
  onEdit,
  onViewEvidence,
}: {
  plan: Plan;
  active: boolean;
  decisionPlanId: string | null;
  healthState: string;
  onSelect: () => void;
  onEdit: () => void;
  onViewEvidence: () => void;
}) {
  const data = useAppStore((state) => state);
  const selected = plan.id === decisionPlanId;
  const statusText =
    selected && healthState === 'valid'
      ? '已确认'
      : selected && healthState === 'needs-reconfirm'
        ? '需要重新确认'
        : selected && healthState === 'hold'
          ? '本轮暂不投放'
          : selected
            ? '待确认'
            : '候选方案';
  const themes = data.themes.filter((theme) => plan.evidenceThemeIds.includes(theme.id));
  const total = totalPlanCents(plan);

  return (
    <Card
      className={`relative flex flex-col ${active ? 'border-[#b9c9dc] shadow-[0_14px_36px_-30px_rgba(36,62,99,.42)]' : ''}`}
    >
      {active ? (
        <span className="absolute -top-px left-6 right-6 h-[2px] rounded-full bg-brand" aria-hidden="true" />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-[7px] text-[11px] font-bold ${active ? 'bg-brand text-white' : 'bg-[#f1f4f8] text-muted'}`}>
              {plan.code}
            </span>
            <h3 className="text-[16px] font-bold tracking-[-0.02em] text-ink">{plan.name}</h3>
          </div>
          <p className="mt-1.5 max-w-xl text-[11px] leading-5 text-muted">{plan.positioning}</p>
        </div>
        <Tag tone={statusText === '已确认' ? 'mint' : statusText === '需要重新确认' ? 'warning' : statusText === '待确认' ? 'brand' : 'neutral'}>
          {statusText}
        </Tag>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">目标消费者</p>
          <p className="mt-0.5 text-[11px] leading-5 text-ink">{plan.audience}</p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-faint">核心信息</p>
          <p className="mt-0.5 text-[11px] font-medium leading-5 text-ink">“{plan.coreMessage}”</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {plan.platforms.map((platform) => (
          <Tag key={platform} tone="outline">
            {platform}
          </Tag>
        ))}
      </div>

      <div className="mt-3 rounded-[11px] border border-line bg-[#fbfcfd] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-faint">渠道预算</span>
          <span className="tabular text-[12px] font-bold text-ink">{formatCny(total)}</span>
        </div>
        <div className="mt-2 flex gap-1">
          {plan.channels.map((channel) => (
            <span
              key={channel.channel}
              className="h-1.5 rounded-full bg-data"
              style={{ width: `${(channel.budgetCents / Math.max(1, total)) * 100}%`, opacity: 0.45 + (channel.budgetCents / Math.max(1, total)) * 0.55 }}
              title={`${channel.channel} ${formatCny(channel.budgetCents)}`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {plan.channels.map((channel) => (
            <span key={channel.channel} className="text-[11px] text-faint">
              {channel.channel} {formatCny(channel.budgetCents)}
            </span>
          ))}
        </div>
      </div>

<details className="disclosure mt-3"><summary>约束、不确定性与关联主题</summary>      <div className="mt-3 grid gap-2 text-[12px] leading-5 sm:grid-cols-2">
        <div>
          <p className="font-semibold text-[#7b5718]">关键约束</p>
          <ul className="mt-0.5 list-inside list-disc text-muted">
            {plan.constraints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-[#2b4b72]">不确定性</p>
          <ul className="mt-0.5 list-inside list-disc text-muted">
            {plan.uncertainties.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {themes.map((theme) => (
          <Tag key={theme.id} tone="data">
            {theme.title} · {theme.evidenceSignalIds.length} 证据
          </Tag>
        ))}
      </div>

</details>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant={active ? 'primary' : 'secondary'} onClick={onSelect}>
          {active ? '正在编辑' : '选择并编辑'}
        </Button>
        <Button size="sm" variant="ghost" icon={<PencilLine size={12} />} onClick={onEdit}>
          编辑方案
        </Button>
        <Button size="sm" variant="ghost" icon={<FileCheck2 size={12} />} onClick={onViewEvidence}>
          查看依据
        </Button>
      </div>
    </Card>
  );
}

function PlanEditDrawer({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
  const data = useAppStore((state) => state);
  const [form, setForm] = useState({
    name: '',
    positioning: '',
    audience: '',
    coreMessage: '',
    timing: '',
    rationale: '',
    platforms: '',
    formats: '',
    constraints: '',
    uncertainties: '',
  });

  useEffect(() => {
    if (plan) {
      setForm({
        name: plan.name,
        positioning: plan.positioning,
        audience: plan.audience,
        coreMessage: plan.coreMessage,
        timing: plan.timing,
        rationale: plan.rationale,
        platforms: plan.platforms.join('、'),
        formats: plan.formats.join('、'),
        constraints: plan.constraints.join('\n'),
        uncertainties: plan.uncertainties.join('\n'),
      });
    }
  }, [plan]);

  if (!plan) return null;

  const set = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Drawer
      open={Boolean(plan)}
      onClose={onClose}
      eyebrow={`方案 ${plan.code} · 编辑`}
      title="编辑营销方案"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-faint">修改会改变方案内容并影响审批依据。</p>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              icon={<Save size={14} />}
              onClick={() => {
                if (!form.name.trim() || !form.coreMessage.trim() || !form.audience.trim()) {
                  toast('请填写方案名、目标消费者与核心信息', undefined, 'warning');
                  return;
                }
                data.updatePlanMeta(plan.id, {
                  name: form.name.trim(),
                  positioning: form.positioning.trim(),
                  audience: form.audience.trim(),
                  coreMessage: form.coreMessage.trim(),
                  timing: form.timing.trim(),
                  rationale: form.rationale.trim(),
                  platforms: form.platforms.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
                  formats: form.formats.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
                  constraints: form.constraints.split('\n').map((item) => item.trim()).filter(Boolean),
                  uncertainties: form.uncertainties.split('\n').map((item) => item.trim()).filter(Boolean),
                });
                toast('方案已更新', '预算图表与审批依据状态已同步；如已确认需重新确认。', 'success');
                onClose();
              }}
            >
              保存修改
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="方案名称" htmlFor="plan-name">
          <input id="plan-name" className="input" value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label="方案定位" htmlFor="plan-positioning">
          <textarea id="plan-positioning" className="textarea" rows={2} value={form.positioning} onChange={(event) => set('positioning', event.target.value)} />
        </Field>
        <Field label="目标消费者" htmlFor="plan-audience">
          <textarea id="plan-audience" className="textarea" rows={2} value={form.audience} onChange={(event) => set('audience', event.target.value)} />
        </Field>
        <Field label="核心营销信息" htmlFor="plan-message">
          <input id="plan-message" className="input" value={form.coreMessage} onChange={(event) => set('coreMessage', event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="推荐平台（用顿号分隔）" htmlFor="plan-platforms">
            <input id="plan-platforms" className="input" value={form.platforms} onChange={(event) => set('platforms', event.target.value)} />
          </Field>
          <Field label="内容形式（用顿号分隔）" htmlFor="plan-formats">
            <input id="plan-formats" className="input" value={form.formats} onChange={(event) => set('formats', event.target.value)} />
          </Field>
        </div>
        <Field label="建议投放时段" htmlFor="plan-timing">
          <input id="plan-timing" className="input" value={form.timing} onChange={(event) => set('timing', event.target.value)} />
        </Field>
        <Field label="决策理由" htmlFor="plan-rationale">
          <textarea id="plan-rationale" className="textarea" rows={3} value={form.rationale} onChange={(event) => set('rationale', event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="关键约束（每行一条）" htmlFor="plan-constraints">
            <textarea id="plan-constraints" className="textarea" rows={4} value={form.constraints} onChange={(event) => set('constraints', event.target.value)} />
          </Field>
          <Field label="不确定性（每行一条）" htmlFor="plan-uncertainties">
            <textarea id="plan-uncertainties" className="textarea" rows={4} value={form.uncertainties} onChange={(event) => set('uncertainties', event.target.value)} />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function ApprovalSnapshotModal({
  open,
  onClose,
  approval,
}: {
  open: boolean;
  onClose: () => void;
  approval?: {
    id: string;
    planCode: string;
    approvedAt: string;
    reason: string;
    companyBudgetCents: number;
    fingerprint: string;
    note: string;
    plan: Plan;
    evidenceSignalIds: string[];
  };
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="审批快照"
      description="快照是确认当时方案、预算与关键证据状态的不可变副本。"
      size="lg"
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {!approval ? (
        <InfoBanner tone="neutral">当前没有可查看的审批快照。</InfoBanner>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">快照 ID</p>
              <p className="tabular mt-0.5 text-[12px] font-bold text-ink">{approval.id}</p>
            </div>
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">确认时间</p>
              <p className="mt-0.5 text-[12px] font-semibold text-ink">{formatDateTime(approval.approvedAt)}</p>
            </div>
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">预算上限</p>
              <p className="tabular mt-0.5 text-[12px] font-bold text-ink">{formatCny(approval.companyBudgetCents)}</p>
            </div>
          </div>
          <div className="rounded-[12px] border border-line bg-[#fbfcfd] p-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-faint">方案内容</p>
            <p className="mt-1 text-[13px] font-bold text-ink">
              方案 {approval.planCode} · {approval.plan.name}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-muted">{approval.plan.positioning}</p>
            <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {approval.plan.channels.map((channel) => (
                <div key={channel.channel} className="flex items-center justify-between rounded-[8px] bg-white px-2.5 py-1.5">
                  <span className="text-[12px] text-muted">{channel.channel}</span>
                  <span className="tabular text-[11px] font-semibold text-ink">{formatCny(channel.budgetCents)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-faint">确认理由</p>
            <p className="mt-1 rounded-[10px] bg-[#f8fafb] px-3 py-2 text-[12px] leading-5 text-ink">{approval.reason}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">关联证据</p>
              <p className="tabular mt-0.5 text-[13px] font-bold text-ink">{approval.evidenceSignalIds.length} 条</p>
              <p className="mt-1 text-[11px] leading-4 text-faint">{approval.evidenceSignalIds.join('、')}</p>
            </div>
            <div className="rounded-[11px] border border-line px-3 py-2">
              <p className="text-[12px] text-faint">输入指纹</p>
              <p className="tabular mt-0.5 break-all text-[12px] font-semibold text-ink">{approval.fingerprint}</p>
            </div>
          </div>
          <InfoBanner tone="neutral">{approval.note}</InfoBanner>
        </div>
      )}
    </Modal>
  );
}
