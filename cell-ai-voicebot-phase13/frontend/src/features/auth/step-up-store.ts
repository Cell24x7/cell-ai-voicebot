import { create } from 'zustand';

interface StepUpState {
  open: boolean;
  resolve: ((ok: boolean) => void) | null;
  request: () => Promise<boolean>;
  finish: (ok: boolean) => void;
}

/** One pending step-up at a time; parallel 428s share it. */
export const useStepUpStore = create<StepUpState>()((set, get) => {
  let pending: Promise<boolean> | null = null;
  return {
    open: false,
    resolve: null,
    request: () => {
      pending ??= new Promise<boolean>((resolve) => set({ open: true, resolve })).finally(() => {
        pending = null;
      });
      return pending;
    },
    finish: (ok) => {
      get().resolve?.(ok);
      set({ open: false, resolve: null });
    },
  };
});
