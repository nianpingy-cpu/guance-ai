import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FilterX,
  Plus,
  RotateCcw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { Signal, SignalFilters, SignalPriority, SignalStatus } from '@/types/domain';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { toast } from '@/store/toast';
import {
  categoryLabel,
  filterSignals,
  priorityLabel,
  signalStats,
  signalTrend,
  statusLabel,
} from '@/lib/calculations';
import { formatDate } from '@/lib/format';
import { PageHeader, DemoBadge, MetaItem } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Field, InfoBanner, Segmented } from '@/components/ui/Form';
import { EmptyState } from '@/components/ui/Progress';
import { SignalTrendChart } from '@/components/charts/SignalTrendChart';
import { SourceRankChart } from '@/components/charts/SourceRankChart';

const defaultFilters: SignalFilters = {
  query: '',
  platform: 'all',
  category: 'all',
  priority: 'all',
  status: 'all',
  range: 'all',
};

const priorityTone = (priority: SignalPriority) =>
  priority === 'high' ? 'hero' : priority === 'medium' ? 'warning' : 'neutral';

const statusTone = (status: SignalStatus) =>
  status === 'verified'
    ? 'mint'
    : status === 'pending'
      ? 'warning'
      : status === 'disputed'
        ? 'danger'
        : 'neutral';

export function SignalsPage() {
  const [page, setPage] = useState(1);
  const data = useAppStore((state) => state);
  const openImport = useUiStore((state) => state.openImportModal);
  const openQuickAdd = useUiStore((state) => state.openQuickAdd);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const dateParam = searchParams.get('date');
  const [filters, setFilters] = useState<SignalFilters>(() => ({ ...defaultFilters, date: dateParam ?? undefined }));
  const [taskModalOpen, setTaskModalOpen] = useState(searchParams.get('tasks') === 'open');

  const selectedSignal = focusId ? data.signals.find((signal) => signal.id === focusId) : undefined;
  const filtered = useMemo(() => filterSignals(data.signals, filters), [data.signals, filters]);
  const stats = signalStats(filtered);
  const allStats = signalStats(data.signals);
  const trend = signalTrend(filtered, 21);
  const platforms = [...new Set(data.signals.map((signal) => signal.platform))].sort();
  const openTasks = data.feedbackTasks.filter((task) => task.status === 'open');
  const doneTasks = data.feedbackTasks.filter((task) => task.status === 'done');
  const activeFilterCount = [
    filters.query,
    filters.platform !== 'all' ? filters.platform : '',
    filters.category !== 'all' ? filters.category : '',
    filters.priority !== 'all' ? filters.priority : '',
    filters.status !== 'all' ? filters.status : '',
    filters.range !== 'all' ? filters.range : '',
    filters.date ?? '',
  ].filter(Boolean).length;

  useEffect(() => {
    if (dateParam) {
      setFilters((current) => ({ ...current, date: dateParam }));
    }
  }, [dateParam]);

  const setFilter = <K extends keyof SignalFilters>(key: K, value: SignalFilters[K]) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearDate = () => {
    setFilters((current) => ({ ...current, date: undefined }));
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setPage(1);
    setFilters(defaultFilters);
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  };

  const openSignal = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('focus', id);
    setSearchParams(next);
  };

  const closeSignal = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="page-wrap">
      <PageHeader
        title="市场情报"
        description="核实市场变化，为每一项营销判断保留依据。"
        meta={
          <>
            <MetaItem label="来源" value={`${allStats.platforms.length} 个平台`} />
            <MetaItem label="最近更新" value={formatDate(allStats.latest, true)} />
            <DemoBadge />
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setTaskModalOpen(true)} icon={<CircleDashed size={14} />}>
              下一轮任务
              {openTasks.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-[#fdf5e6] px-1.5 py-0.5 text-[11px] font-bold text-[#8a5a12]">
                  {openTasks.length}
                </span>
              ) : null}
            </Button>
            {window.guance && <Button variant="primary" icon={<Plus size={14} />} onClick={openQuickAdd}>
              粘贴添加
            </Button>}
            <Button variant="ghost" icon={<Upload size={14} />} onClick={openImport}>
              导入情报
            </Button>
          </>
        }
      />

      <div className="signal-summary" aria-label="筛选结果概览">
        <span><strong>{stats.total}</strong> 条结果</span><span>{stats.high} 条重点</span><span>{stats.pending} 条待核实</span>
        <span className="ml-auto">{activeFilterCount ? `${activeFilterCount} 个筛选条件` : data.mode === 'real' ? '全部业务情报' : '全部模拟情报'}</span>
      </div>
      <details className="disclosure mb-5">
        <summary>查看情报分布与来源</summary>
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <SignalTrendChart
            points={trend}
            selectedDate={filters.date}
            onSelectDate={(date) => {
              setFilters((current) => ({
                ...current,
                date: current.date === date ? undefined : date,
              }));
              const next = new URLSearchParams(searchParams);
              if (filters.date === date) next.delete('date');
              else next.set('date', date);
              setSearchParams(next, { replace: true });
            }}
            title="情报时间分布"
            subtitle="随筛选条件变化；点击日期可只看当日情报，再次点击取消"
          />
        </div>
        <div className="lg:col-span-5">
          <SourceRankChart
            data={stats.platforms}
            total={stats.total}
            selectedPlatform={filters.platform === 'all' ? undefined : filters.platform}
            onSelectPlatform={(platform) =>
              setFilter('platform', filters.platform === platform ? 'all' : platform)
            }
          />
        </div>
      </div>

      </details>
      {openTasks.length > 0 ? <button type="button" className="task-strip" onClick={() => setTaskModalOpen(true)}><span>下一轮采集与核对 · {openTasks.length} 项待办</span><span>查看任务 →</span></button> : null}

      <Card className="mt-4" padded={false}>
        <div className="border-b border-line p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionHeader
                title="情报清单"
                description="点击记录查看原始证据、修改重要性与核实状态。"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular text-[11px] text-muted">
                {filtered.length} / {data.signals.length} 条
              </span>
              {activeFilterCount > 0 ? (
                <Button size="sm" variant="ghost" icon={<FilterX size={13} />} onClick={resetFilters}>
                  清除筛选
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-12">
            <div className="relative xl:col-span-2">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                aria-label="搜索情报"
                className="input !pl-8"
                placeholder="搜索标题、摘要、标签…"
                value={filters.query}
                onChange={(event) => setFilter('query', event.target.value)}
              />
            </div>
            <select
              aria-label="来源平台"
              className="select xl:col-span-2"
              value={filters.platform}
              onChange={(event) => setFilter('platform', event.target.value)}
            >
              <option value="all">全部平台</option>
              {platforms.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
            <select
              aria-label="类别"
              className="select xl:col-span-2"
              value={filters.category}
              onChange={(event) =>
                setFilter('category', event.target.value as SignalFilters['category'])
              }
            >
              <option value="all">全部类别</option>
              <option value="consumer">消费者</option>
              <option value="competitor">竞品</option>
              <option value="industry">行业</option>
            </select>
            <select
              aria-label="重要性"
              className="select xl:col-span-2"
              value={filters.priority}
              onChange={(event) =>
                setFilter('priority', event.target.value as SignalFilters['priority'])
              }
            >
              <option value="all">全部重要性</option>
              <option value="high">高优先级</option>
              <option value="medium">中优先级</option>
              <option value="low">低优先级</option>
            </select>
            <select
              aria-label="处理状态"
              className="select xl:col-span-2"
              value={filters.status}
              onChange={(event) => setFilter('status', event.target.value as SignalFilters['status'])}
            >
              <option value="all">全部状态</option>
              <option value="verified">已核实</option>
              <option value="pending">待核实</option>
              <option value="disputed">有争议</option>
              <option value="duplicate">重复</option>
            </select>
            <select
              aria-label="时间范围"
              className="select xl:col-span-2"
              value={filters.range}
              onChange={(event) => setFilter('range', event.target.value as SignalFilters['range'])}
            >
              <option value="all">全部时间</option>
              <option value="7d">近 7 天</option>
              <option value="14d">近 14 天</option>
              <option value="30d">近 30 天</option>
            </select>
          </div>

          {filters.date ? (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[12px] text-faint">日期筛选</span>
              <button
                type="button"
                onClick={clearDate}
                className="tag tag-brand transition-colors hover:bg-[#dce6f3]"
              >
                {formatDate(filters.date, true)} <X size={11} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="divide-y divide-line">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="没有匹配的情报"
                description="尝试放宽关键词、来源或时间范围；也可以粘贴公众号链接或抖音/小红书文案。"
                action={
                  <div className="flex gap-2">
                    <Button size="sm" onClick={resetFilters} icon={<RotateCcw size={13} />}>
                      重置筛选
                    </Button>
                    {window.guance && <Button size="sm" variant="primary" onClick={openQuickAdd} icon={<Plus size={13} />}>
                      粘贴添加
                    </Button>}
                    <Button size="sm" onClick={openImport} icon={<Upload size={13} />}>
                      导入情报
                    </Button>
                  </div>
                }
              />
            </div>
          ) : (
            filtered.slice((Math.min(page, Math.max(1, Math.ceil(filtered.length / 50))) - 1) * 50, Math.min(page, Math.max(1, Math.ceil(filtered.length / 50))) * 50).map((signal) => (
              <SignalRow key={signal.id} signal={signal} onOpen={openSignal} />
            ))
          )}
        </div>
        {filtered.length > 50 && <div className="flex items-center justify-between gap-3 border-t border-line p-4 text-xs text-muted"><span>第 {Math.min(page, Math.ceil(filtered.length / 50))} / {Math.ceil(filtered.length / 50)} 页 · 每页50条</span><div className="flex gap-2"><Button size="sm" disabled={page <= 1} onClick={() => setPage(Math.max(1, Math.min(page, Math.ceil(filtered.length / 50)) - 1))}>上一页</Button><Button size="sm" disabled={page >= Math.ceil(filtered.length / 50)} onClick={() => setPage(Math.min(page, Math.ceil(filtered.length / 50)) + 1)}>下一页</Button></div></div>}
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-line bg-white/60 px-4 py-3">
        <p className="text-[12px] leading-5 text-muted">
          <span className="font-semibold text-ink">来源边界：</span>
          {data.mode === 'real' ? '每条情报保留导入或采集来源。公开资料与模型判断均需人工核实。' : '情报来源为团队编写的模拟平台摘录，不包含真实爬虫、平台授权数据或真实用户个人信息。'}
        </p>
        <span className="text-[12px] text-faint">事实 · 判断 · 待核实信息分开展示</span>
      </div>

      <SignalDrawer signal={selectedSignal} onClose={closeSignal} onOpenSignal={openSignal} />

      <Modal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        title="下一轮待补情报任务"
        description="任务来自复盘结论、冲突信号或导入校验；完成后仍保留记录。"
        size="lg"
        footer={<Button onClick={() => setTaskModalOpen(false)}>关闭</Button>}
      >
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Tag tone="warning">{openTasks.length} 项待办</Tag>
              <span className="text-[11px] text-muted">点击任务可打开关联情报</span>
            </div>
            <div className="space-y-2">
              {openTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-[12px] border border-line bg-white px-4 py-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setTaskModalOpen(false);
                      if (task.linkedSignalIds[0]) openSignal(task.linkedSignalIds[0]);
                    }}
                  >
                    <p className="text-[12px] font-semibold text-ink">{task.title}</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-muted">{task.detail}</p>
                    <p className="mt-1 text-[12px] text-faint">
                      {task.trigger} · 创建于 {formatDate(task.createdAt, true)}
                    </p>
                  </button>
                  <Button
                    size="sm"
                    variant="mint"
                    onClick={() => {
                      data.toggleFeedbackTask(task.id);
                      toast('任务已标记完成', task.title, 'success');
                    }}
                  >
                    标记完成
                  </Button>
                </div>
              ))}
              {openTasks.length === 0 ? <EmptyState compact title="暂无待办" description="所有下一轮情报任务已完成。" /> : null}
            </div>
          </div>

          {doneTasks.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold text-faint">已完成</p>
              <div className="space-y-2">
                {doneTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2 rounded-[11px] bg-[#f8fafb] px-3 py-2">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-muted line-through">{task.title}</p>
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-brand hover:underline"
                        onClick={() => data.toggleFeedbackTask(task.id)}
                      >
                        重新打开
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function SignalRow({ signal, onOpen }: { signal: Signal; onOpen: (id: string) => void }) {
  const data = useAppStore((state) => state);
  const source = data.sources.find((item) => item.id === signal.sourceId);
  return (
    <button
      type="button"
      onClick={() => onOpen(signal.id)}
      className="group grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-[#fbfcfd] sm:px-5 lg:grid-cols-12"
    >
      <div className="flex items-start gap-3 lg:col-span-8">
        <span
          className={`mt-1 h-9 w-[3px] shrink-0 rounded-full ${
            signal.priority === 'high' ? 'bg-hero' : signal.priority === 'medium' ? 'bg-warning' : 'bg-line'
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone={priorityTone(signal.priority)}>{priorityLabel[signal.priority]}优先级</Tag>
            <Tag tone="outline">{categoryLabel[signal.category]}</Tag>
            <Tag tone={statusTone(signal.status)}>{statusLabel[signal.status]}</Tag>
            {signal.conflictGroup ? <Tag tone="outline">关联冲突组</Tag> : null}
            <span className="tabular text-[11px] text-faint">{signal.id}</span>
          </div>
          <p className="mt-1.5 text-[13px] font-semibold leading-5 text-ink group-hover:text-brand">
            {signal.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">{signal.summary}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2 pl-6 text-[12px] text-faint lg:col-span-4 lg:pl-0">
        <div>
          <p className="font-medium text-muted">{source?.platform ?? signal.platform}</p>
          <p className="mt-0.5">{source?.publishedAt ? formatDate(source.publishedAt, true) : '原文未提供'}</p>
          <p className="mt-0.5 line-clamp-1 max-w-[210px]">{source?.name}</p>
        </div>
        <span className="inline-flex items-center gap-1 font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
          查看证据 <ArrowRight size={12} />
        </span>
      </div>
    </button>
  );
}

function SignalDrawer({
  signal,
  onClose,
  onOpenSignal,
}: {
  signal?: Signal;
  onClose: () => void;
  onOpenSignal: (id: string) => void;
}) {
  const data = useAppStore((state) => state);
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<SignalPriority>('medium');
  const [status, setStatus] = useState<SignalStatus>('pending');

  useEffect(() => {
    if (signal) {
      setNote(signal.note);
      setPriority(signal.priority);
      setStatus(signal.status);
    }
  }, [signal]);

  if (!signal) return null;
  const source = data.sources.find((item) => item.id === signal.sourceId);
  const duplicate = signal.duplicateOf ? data.signals.find((item) => item.id === signal.duplicateOf) : undefined;
  const related = signal.conflictGroup
    ? data.signals.filter(
        (item) => item.conflictGroup === signal.conflictGroup && item.id !== signal.id,
      )
    : [];

  const applyPriority = (next: SignalPriority) => {
    setPriority(next);
    const result = data.updateSignal(signal.id, { priority: next });
    if (result.ok) {
      toast('优先级已更新', '工作台重点信号数量与审批依据状态已同步。', 'success');
    } else {
      toast('更新失败', result.message, 'danger');
    }
  };

  const applyStatus = (next: SignalStatus) => {
    setStatus(next);
    const result = data.updateSignal(signal.id, { status: next });
    if (result.ok) {
      toast(
        '情报状态已更新',
        next === 'verified' ? '已记录核实时间；工作台统计已同步。' : '工作台统计与审批依据状态已同步。',
        'success',
      );
    } else {
      toast('更新失败', result.message, 'danger');
    }
  };

  return (
    <Drawer
      open={Boolean(signal)}
      onClose={onClose}
      eyebrow={`情报详情 · ${signal.id}`}
      title={signal.title}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-faint">修改会立即影响工作台统计，并可能触发方案重新确认。</p>
          <div className="flex gap-2">
            <Button onClick={onClose}>关闭</Button>
            <Button
              variant="primary"
              onClick={() => {
                data.updateSignalNote(signal.id, note);
                toast('备注已保存', '备注保存在本机。', 'success');
              }}
            >
              保存备注
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag tone={priorityTone(priority)}>{priorityLabel[priority]}优先级</Tag>
          <Tag tone={statusTone(status)} dot>
            {statusLabel[status]}
          </Tag>
          <Tag tone="outline">{categoryLabel[signal.category]}</Tag>
          <span className="text-[12px] text-faint">相关性 {signal.relevance}/5</span>
        </div>

        <div className="rounded-[14px] border border-line bg-[#fbfcfd] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-faint">原始来源片段</p>
              <p className="mt-1.5 text-[13px] leading-6 text-ink">“{signal.quote}”</p>
            </div>
            <Tag tone="outline">{source?.simulated ? '模拟文本' : source?.origin === 'manual' ? '人工导入' : '公开来源 · 待核实'}</Tag>
          </div>
          <div className="mt-3 grid gap-2 border-t border-line pt-3 text-[11px] leading-5 text-muted sm:grid-cols-2">
            <p>
              <span className="text-faint">来源：</span>
              {source?.name ?? '未知来源'}
            </p>
            <p>
              <span className="text-faint">平台：</span>
              {signal.platform}
            </p>
            <p>
              <span className="text-faint">发布日期：</span>
              {source?.publishedAt ? formatDate(source.publishedAt, true) : '原文未提供'}
            </p>
            <p>
              <span className="text-faint">获取依据：</span>
              {source?.note ?? '演示来源说明'}
            </p>
            {source?.url && /^https?:\/\//i.test(source.url) ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-2"
              >
                {source.simulated ? '打开模拟来源链接' : '打开原始来源链接'}
              </a>
            ) : null}
          </div>
        </div>

        {source?.rawContent && <details className="rounded-xl border border-line p-4"><summary className="cursor-pointer text-xs font-semibold">完整采集正文与追踪记录</summary><p className="mt-3 break-all text-xs leading-6 text-muted">采集：{source.collectedAt} · 任务：{source.taskId ?? '人工导入'} · 内容摘要：{source.contentHash ?? '人工记录'}</p><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-6">{source.rawContent}</pre></details>}
        <div className="grid gap-3">
          <section>
            <p className="eyebrow mb-1.5">观测事实</p>
            <p className="rounded-[11px] border border-line px-3.5 py-3 text-[12px] leading-6 text-ink">
              {signal.summary}
            </p>
          </section>
          <section>
            <p className="eyebrow mb-1.5">分析性判断{source?.simulated ? '（演示预设）' : '（待核实）'}</p>
            <p className="rounded-[11px] border border-[#dce6f3] bg-[#f7faff] px-3.5 py-3 text-[12px] leading-6 text-[#2b4b72]">
              {signal.impact}
            </p>
          </section>
          <section>
            <p className="eyebrow mb-1.5">待核实 / 冲突信息</p>
            <div className="rounded-[11px] border border-[#f0dfbd] bg-[#fdfaf2] px-3.5 py-3 text-[12px] leading-6 text-[#7b5718]">
              {signal.status === 'pending'
                ? '当前记录仍待人工核实，不能当作确定事实用于方案结论。'
                : signal.status === 'disputed'
                  ? '该记录存在冲突或争议，需保留双方表述并补充证据。'
                  : signal.status === 'duplicate'
                    ? `该记录被标记为 ${signal.duplicateOf ?? '其他记录'} 的重复项，不重复计入重点统计。`
                    : '当前记录已人工标记为已核实；仍保留原始来源说明。'}
              {duplicate ? (
                <button
                  type="button"
                  className="ml-1 font-semibold underline underline-offset-2"
                  onClick={() => onOpenSignal(duplicate.id)}
                >
                  查看主记录 {duplicate.id}
                </button>
              ) : null}
            </div>
            {related.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-[12px] text-faint">同冲突组：</span>
                {related.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenSignal(item.id)}
                    className="tag tag-outline transition-colors hover:border-[#bcc8d6] hover:text-ink"
                  >
                    {item.id} · {item.title.slice(0, 12)}…
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="rounded-[13px] border border-line p-4">
          <p className="text-[12px] font-bold text-ink">调整重要性</p>
          <p className="mt-0.5 text-[12px] text-muted">修改后工作台重点信号数量即时变化。</p>
          <div className="mt-2.5">
            <Segmented
              value={priority}
              onChange={applyPriority}
              ariaLabel="调整情报优先级"
              options={[
                { value: 'high', label: '高' },
                { value: 'medium', label: '中' },
                { value: 'low', label: '低' },
              ]}
            />
          </div>
        </div>

        <div className="rounded-[13px] border border-line p-4">
          <p className="text-[12px] font-bold text-ink">处理状态</p>
          <p className="mt-0.5 text-[12px] text-muted">已核实 / 待核实 / 有争议会同步到筛选和审批依据。</p>
          <div className="mt-2.5">
            <Segmented
              value={status}
              onChange={applyStatus}
              ariaLabel="调整情报处理状态"
              options={[
                { value: 'verified', label: '已核实' },
                { value: 'pending', label: '待核实' },
                { value: 'disputed', label: '有争议' },
              ]}
            />
          </div>
        </div>

        <Field label="人工备注" htmlFor="signal-note" hint="记录核实过程、补充来源或与当前企业的关系。">
          <textarea
            id="signal-note"
            className="textarea"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

        {signal.status !== 'duplicate' && signal.priority === 'high' ? (
          <InfoBanner tone="brand" title="这条情报正在影响当前方案">
            如果该记录被关联到当前方案证据集合，修改优先级或状态后，审批快照会提示需要重新确认。
          </InfoBanner>
        ) : null}
      </div>
    </Drawer>
  );
}
