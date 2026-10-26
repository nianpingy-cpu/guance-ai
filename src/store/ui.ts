import { create } from 'zustand';

interface UiState {
  companyDrawerOpen: boolean;
  importModalOpen: boolean;
  mobileNavOpen: boolean;
  openCompanyDrawer: () => void;
  closeCompanyDrawer: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  companyDrawerOpen: false,
  importModalOpen: false,
  mobileNavOpen: false,
  openCompanyDrawer: () => set({ companyDrawerOpen: true }),
  closeCompanyDrawer: () => set({ companyDrawerOpen: false }),
  openImportModal: () => set({ importModalOpen: true }),
  closeImportModal: () => set({ importModalOpen: false }),
  toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),
}));
