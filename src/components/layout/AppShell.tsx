import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { exportSnapshot } from '@/data/repository';
import { toast } from '@/store/toast';
import type { AppData } from '@/types/domain';
import { DesktopSidebar, MobileSidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { CompanyDrawer } from '@/features/company/CompanyDrawer';
import { ImportModal } from '@/features/signals/ImportModal';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { InfoBanner } from '@/components/ui/Form';
import { ToastViewport } from '@/components/ui/ToastViewport';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Settings } from '@/desktop/Settings';
import { flushDesktop, resetDesktopProject, useDesktopState } from '@/desktop/client';
import { AnalysisPanel } from '@/desktop/AnalysisPanel';
import { CollectionPanel } from '@/desktop/CollectionPanel';

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function snapshotOfState(): AppData {
  const state = useAppStore.getState();
  return {
    schemaVersion: state.schemaVersion,
    mode: state.mode,
    analyses: state.analyses,
    company: state.company,
    sources: state.sources,
    signals: state.signals,
    themes: state.themes,
    opportunities: state.opportunities,
    plans: state.plans,
    approvals: state.approvals,
    reviews: state.reviews,
    feedbackTasks: state.feedbackTasks,
    decision: state.decision,
    activePlanId: state.activePlanId,
  };
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const resetDemo = useAppStore((state) => state.resetDemo);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const handleExport = async () => {
    await flushDesktop();
    const payload = exportSnapshot(snapshotOfState());
    download(payload, '观策AI-当前任务与结果.json', 'application/json;charset=utf-8');
    toast('已导出当前任务与结果', '文件包含企业、情报、方案、审批快照与复盘数据。', 'success');
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <DesktopSidebar onExport={handleExport} onReset={() => setResetOpen(true)} />
      <MobileSidebar onExport={handleExport} onReset={() => setResetOpen(true)} />

      <div className="main-shell min-h-dvh lg:ml-[228px]">
        <Topbar />
        <main key={location.pathname} className="page-enter">
          <ErrorBoundary>
            <Outlet />
            {window.guance && location.pathname === '/strategy' && <AnalysisPanel />}
            {window.guance && location.pathname === '/signals' && <CollectionPanel />}
          </ErrorBoundary>
        </main>
      </div>

      <CompanyDrawer />
      <ImportModal />
      {window.guance && <Settings />}
      <ToastViewport />

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="恢复演示数据？"
        description="仅能重置当前演示项目，业务项目会拒绝此操作。桌面重置前自动备份。"
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>取消</Button>
            <Button
              variant="danger"
              icon={<RotateCcw size={14} />}
              onClick={() => { void (async () => { if (window.guance) { const id = useDesktopState.getState().current!.id; await resetDesktopProject(id); } else resetDemo(); setResetOpen(false); navigate('/dashboard'); toast('演示数据已恢复', '已回到初始演示状态。', 'success'); })().catch((e: unknown) => toast('未恢复数据', String(e), 'warning')); }}
            >
              确认恢复
            </Button>
          </>
        }
      >
        <InfoBanner tone="warning" title="会丢失本机修改">
          当前企业资料、情报备注与优先级、方案预算、审批快照、实际投放数据和下一轮任务都会被替换。建议先使用左侧“导出当前任务 JSON”留档。
        </InfoBanner>
        <div className="mt-4 space-y-2 text-[12px] leading-6 text-muted">
          <p>恢复后仍会直接进入“工作台”，适合比赛现场重复演示完整流程。</p>
          <p>桌面版保存到本机数据库，启用同步后业务版本会加密同步；Web预览仅保存在浏览器。</p>
        </div>
      </Modal>
    </div>
  );
}
