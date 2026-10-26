import { Menu } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useUiStore } from '@/store/ui';
import { useDesktopState } from '@/desktop/client';

export function Topbar() {
  const company = useAppStore((state) => state.company);
  const openCompany = useUiStore((state) => state.openCompanyDrawer);
  const toggleNav = useUiStore((state) => state.toggleMobileNav);
  const setSettings = useUiStore((state) => state.setSettingsOpen);
  const desktop = useDesktopState();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white print-hide">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
        <button
          type="button"
          className="icon-button lg:hidden"
          onClick={toggleNav}
          aria-label="打开导航"
        >
          <Menu size={19} />
        </button>
        <span className="min-w-0 text-xs text-muted">{desktop.current ? `${desktop.current.mode === 'demo' ? '模拟演示' : '业务项目'} · ${desktop.error ? '保存失败，请检查设置' : desktop.saving ? '正在保存…' : '已保存到本机'}` : '模拟演示 · 数据仅保存在本机'}</span>
        <button
          type="button"
          className="ml-auto max-w-[40%] truncate text-sm font-semibold text-brand"
          onClick={openCompany}
          aria-label="编辑当前企业资料"
        >
          {company.brand}
        </button>
        {window.guance && <button className="button shrink-0" onClick={() => setSettings(true)}>设置</button>}
      </div>
    </header>
  );
}
