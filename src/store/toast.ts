import { create } from 'zustand';

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}

interface ToastState {
  messages: ToastMessage[];
  push: (toast: Omit<ToastMessage, 'id'>) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  messages: [],
  push: (toast) => {
    counter += 1;
    const id = counter;
    set((state) => ({ messages: [...state.messages.slice(-3), { ...toast, id }] }));
    window.setTimeout(() => {
      set((state) => ({ messages: state.messages.filter((message) => message.id !== id) }));
    }, 4200);
  },
  dismiss: (id) =>
    set((state) => ({ messages: state.messages.filter((message) => message.id !== id) })),
}));

export function toast(title: string, description?: string, tone: ToastMessage['tone'] = 'default') {
  useToastStore.getState().push({ title, description, tone });
}
