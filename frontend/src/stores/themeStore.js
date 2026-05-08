import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useThemeStore = create(
  persist(
    (set, get) => ({
      mode: 'light', // 'light' | 'dark'
      primaryColor: '#4361ee',
      toggle: () => set({ mode: get().mode === 'light' ? 'dark' : 'light' }),
      setMode: (mode) => set({ mode }),
      setPrimaryColor: (color) => set({ primaryColor: color }),
    }),
    { name: 'hieploi-theme' }
  )
);

export default useThemeStore;
