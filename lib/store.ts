import { create } from "zustand";

export type Locale = "en" | "ko";

interface UIState {
  selectedClusterId: string | null;
  setSelectedClusterId: (id: string | null) => void;
  focusedBrandId: string | null;
  setFocusedBrandId: (id: string | null) => void;
  getCatOpen: boolean;
  setGetCatOpen: (open: boolean) => void;
  locale: Locale;
  setLocale: (l: Locale) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedClusterId: null,
  setSelectedClusterId: (id) => set({ selectedClusterId: id }),
  focusedBrandId: null,
  setFocusedBrandId: (id) => set({ focusedBrandId: id }),
  getCatOpen: false,
  setGetCatOpen: (open) => set({ getCatOpen: open }),
  locale: "en",
  setLocale: (l) => set({ locale: l }),
}));
