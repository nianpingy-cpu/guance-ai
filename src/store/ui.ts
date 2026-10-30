import { create } from 'zustand';

interface UiState {
  settingsOpen: boolean;
  settingsTab: string;
  setSettingsOpen: (open: boolean) => void;
  openSettings: (tab?: string) => void;
  companyDrawerOpen: boolean;
  importModalOpen: boolean;
  quickAddOpen: boolean;
  mobileNavOpen: boolean;
  openCompanyDrawer: () => void;
  closeCompanyDrawer: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  settingsTab: '项目与备份',
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  openSettings: (settingsTab = '项目与备份') => set({ settingsOpen: true, settingsTab }),
  companyDrawerOpen: false,
  importModalOpen: false,
  quickAddOpen: false,
  mobileNavOpen: false,
  openCompanyDrawer: () => set({ companyDrawerOpen: true }),
  closeCompanyDrawer: () => set({ companyDrawerOpen: false }),
  openImportModal: () => set({ importModalOpen: true }),
  closeImportModal: () => set({ importModalOpen: false }),
  openQuickAdd: () => set({ quickAddOpen: true }),
  closeQuickAdd: () => set({ quickAddOpen: false }),
  toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),
}));
