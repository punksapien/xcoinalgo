'use client';

import { useEffect } from 'react';
import { initializeTheme } from '@/lib/theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  useEffect(() => {
    initializeTheme();
  }, []);

  return <>{children}</>;
}