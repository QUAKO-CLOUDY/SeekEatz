"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');

  // Initial load
  useEffect(() => {
    const savedTheme = localStorage.getItem('macromatch-theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  // Handle system changes and resolution
  useEffect(() => {
    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const updateResolved = () => {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      };

      // Set initial
      updateResolved();

      // Listen for changes
      mediaQuery.addEventListener('change', updateResolved);
      return () => mediaQuery.removeEventListener('change', updateResolved);
    } else {
      setResolvedTheme(theme);
    }
  }, [theme]);

  // Apply to DOM
  useEffect(() => {
    localStorage.setItem('macromatch-theme', theme);
    
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
  }, [theme, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}