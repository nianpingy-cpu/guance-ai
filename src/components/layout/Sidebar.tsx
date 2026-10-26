import { NavLink } from 'react-router-dom';
import {
  ClipboardCheck,
  Download,
  LayoutDashboard,
  Lightbulb,
  Radar,
  RotateCcw,
  X,
} from 'lucide-react';
import { cn } from '@/lib/format';
import { useUiStore } from '@/store/ui';

const navItems = [
  { to: '/dashboard', label: '工作台', hint: '本周任务与变化', icon: LayoutDashboard },
  { to: '/signals', label: '市场情报', hint: '来源、证据与核实', icon: Radar },
  { to: '/strategy', label: '洞察与策略', hint: '主题、方案与审批', icon: Lightbulb },
  { to: '/review', label: '效果复盘', hint: '计划、实际与下一轮', icon: ClipboardCheck },
];

export function SidebarContent({
  onExport,
  onReset,
  onNavigate,
  onClose,
}: {
  onExport: () => void;
  onReset: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-5 pt-6">
        <NavLink to="/dashboard" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span className="relative flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand text-white shadow-[0_8px_18px_-12px_rgba(36,62,99,.8)]">
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 15.5V10.5M8 15.5V7M13 15.5V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="17" cy="5" r="1.8" fill="#9BE6C0" />
            </svg>
          </span>
          <span>
            <span className="block text-[16px] font-bold leading-5 tracking-[-0.03em] text-ink">观策 AI</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              Decision workspace
            </span>
          </span>
        </NavLink>
        {onClose ? (
          <button type="button" className="icon-button lg:hidden" onClick={onClose} aria-label="关闭导航">
            <X size={18} />
          </button>
        ) : null}
      </div>

      <div className="px-3">
        <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-faint">工作区</p>
        <nav aria-label="主导航" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-[11px] px-3 py-2.5 transition-colors duration-180',
                    isActive
                      ? 'bg-brand text-white shadow-[0_8px_18px_-16px_rgba(36,62,99,.9)]'
                      : 'text-muted hover:bg-[#f5f7fa] hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={17} strokeWidth={isActive ? 2.1 : 1.8} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-5">{item.label}</span>

                    </span>

                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-1 px-3 pb-4 pt-4">
        <button
          type="button"
          onClick={onExport}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-[#f5f7fa] hover:text-ink"
        >
          <Download size={14} />
          导出当前任务 JSON
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-[#f5f7fa] hover:text-ink"
        >
          <RotateCcw size={14} />
          恢复演示数据
        </button>
        <div className="mt-2 flex items-center justify-between border-t border-line px-3 pt-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">v0.5 · Web MVP</span>
          <span className="h-1.5 w-1.5 rounded-full bg-mint" title="前端演示环境" />
        </div>
      </div>
    </div>
  );
}

export function DesktopSidebar({ onExport, onReset }: { onExport: () => void; onReset: () => void }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] border-r border-line bg-white lg:block print-hide">
      <SidebarContent onExport={onExport} onReset={onReset} />
    </aside>
  );
}

export function MobileSidebar({ onExport, onReset }: { onExport: () => void; onReset: () => void }) {
  const open = useUiStore((state) => state.mobileNavOpen);
  const close = useUiStore((state) => state.closeMobileNav);
  if (!open) return null;
  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cn(
          'absolute inset-0 bg-[rgba(23,32,51,.34)] backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[270px] bg-white shadow-[26px_0_70px_-34px_rgba(23,32,51,.45)] transition-transform duration-220',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="移动端导航"
      >
        <SidebarContent onExport={onExport} onReset={onReset} onNavigate={close} onClose={close} />
      </aside>
    </div>
  );
}
