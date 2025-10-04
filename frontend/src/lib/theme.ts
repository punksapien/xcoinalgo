import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      toggleTheme: () => {
        const { isDark } = get();
        const newTheme = !isDark;
        set({ isDark: newTheme });
        updateThemeClass(newTheme);
      },
      setTheme: (isDark: boolean) => {
        set({ isDark });
        updateThemeClass(isDark);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          updateThemeClass(state.isDark);
        }
      },
    }
  )
);

const updateThemeClass = (isDark: boolean) => {
  if (typeof document !== 'undefined') {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
};

// Initialize theme based on system preference on first load
export const initializeTheme = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme-storage');
    if (!stored) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      useTheme.getState().setTheme(prefersDark);
    }
  }
};