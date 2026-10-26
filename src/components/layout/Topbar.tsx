import { useLocation } from 'react-router-dom';
import { ChevronDown, Menu, PencilLine, Upload } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { campaignProgress } from '@/lib/calculations';
import { cn } from '@/lib/format';
import { Tag } from '@/components/ui/Tag';

const pageTitles: Record<string, string> = {
  '/dashboard': '工作台',
  '/signals': '市场情报',
  '/strategy': '洞察与策略',
  '/review': '效果复盘',
};

export function Topbar() {
  const pathname = useLocation().pathname;
  const company = useAppStore((state) => state.company);
  const progress = useAppStore((state) => campaignProgress(state));
  const openCompany = useUiStore((state) => state.openCompanyDrawer);
  const openImport = useUiStore((state) => state.openImportModal);
  const toggleNav = useUiStore((state) => state.toggleMobileNav);

  const statusTone =
    progress.phase === '待重新确认'
      ? 'warning'
      : progress.phase === '本轮暂不投放'
        ? 'neutral'
        : progress.phase.includes('复盘')
          ? 'mint'
          : 'brand';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[rgba(255,255,255,.86)] backdrop-blur-[10px] print-hide">
      <div className="flex h-[64px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          className="icon-button -ml-1 lg:hidden"
          onClick={toggleNav}
          aria-label="打开导航"
        >
          <Menu size={19} />
        </button>
        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">观策 AI</span>
          <span className="text-[11px] text-line">/</span>
          <span className="truncate text-[12px] font-semibold text-ink">{pageTitles[pathname] ?? '工作台'}</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <span className="hidden xl:inline-flex">
            <Tag tone="outline" dot>
              演示环境 · 模拟数据
            </Tag>
          </span>

          <button
            type="button"
            onClick={openCompany}
            className="flex min-w-0 items-center gap-2 rounded-[11px] border border-line bg-white px-2 py-1.5 text-left transition-colors hover:border-[#cbd5e1] hover:bg-[#fbfcfd]"
            aria-label="编辑当前企业资料"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-brand text-[11px] font-bold text-white">
              {company.brand.slice(0, 1)}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-[148px] truncate text-[12px] font-bold leading-4 text-ink">
                {company.brand}
              </span>
              <span className="block text-[9px] leading-3 text-faint">当前企业 · 演示</span>
            </span>
            <ChevronDown size={13} className="shrink-0 text-faint" />
          </button>

          <span
            className={cn(
              'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold md:inline-flex',
              statusTone === 'warning'
                ? 'border-[#f0dfbd] bg-[#fdf8ee] text-[#8a5a12]'
                : statusTone === 'mint'
                  ? 'border-[#cfe9dc] bg-[#f2faf6] text-[#25634a]'
                  : statusTone === 'brand'
                    ? 'border-[#d9e3ef] bg-[#f5f8fc] text-[#2b4b72]'
                    : 'border-line bg-[#f7f9fb] text-muted',
            )}
            title={progress.phaseDetail}
          >
            <span className="status-dot bg-current" />
            {progress.phase}
          </span>

          <button
            type="button"
            onClick={openCompany}
            className="btn btn-secondary btn-sm hidden sm:inline-flex"
          >
            <PencilLine size={13} />
            <span className="hidden xl:inline">编辑企业</span>
          </button>
          <button type="button" onClick={openImport} className="btn btn-primary btn-sm">
            <Upload size={13} />
            <span className="hidden sm:inline">导入数据</span>
          </button>
        </div>
      </div>
    </header>
  );
}
