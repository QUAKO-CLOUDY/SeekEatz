"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';

type Theme = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  // Initial load - try Supabase first, then localStorage, then default
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          // Try to load theme preference from Supabase
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('theme_preference')
            .eq('id', user.id)
            .single();
          
          if (!error && profile?.theme_preference && 
              (profile.theme_preference === 'light' || profile.theme_preference === 'dark')) {
            // Use theme from Supabase
            setTheme(profile.theme_preference);
            // Sync to localStorage
            localStorage.setItem('seekeatz-theme', profile.theme_preference);
            return;
          }
        }
      } catch (error) {
        console.warn('Could not load theme from Supabase, falling back to localStorage:', error);
      }
      
      // Fallback to localStorage
      const savedTheme = localStorage.getItem('seekeatz-theme') as Theme;
      if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto')) {
        setTheme(savedTheme);
      } else {
        // Default to light mode if no saved theme exists
        setTheme('light');
        localStorage.setItem('seekeatz-theme', 'light');
      }
    };

    loadTheme();
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
    localStorage.setItem('seekeatz-theme', theme);
    
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