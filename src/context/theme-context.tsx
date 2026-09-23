'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';
export type ChatWidthMode = 'narrow' | 'default' | 'wide';

export interface ThemePreset {
  id: string;
  label: string;
  bg: string;
  fg: string;
  accent: string;
}

export const LIGHT_PRESETS: ThemePreset[] = [
  { id: 'Default Light', label: 'Default Light', bg: '#F9F9F9', fg: '#101010', accent: '#007ACC' },
  { id: 'GitHub Light', label: 'GitHub Light', bg: '#FFFFFF', fg: '#24292F', accent: '#0969DA' },
  { id: 'Solarized Light', label: 'Solarized Light', bg: '#FDF6E3', fg: '#657B83', accent: '#268BD2' },
  { id: 'Catppuccin Latte', label: 'Catppuccin Latte', bg: '#EFF1F5', fg: '#4C4F69', accent: '#1E66F5' },
  { id: 'One Light', label: 'One Light', bg: '#FAFAFA', fg: '#383A42', accent: '#4078F2' },
  { id: 'Rose Pine Dawn', label: 'Rose Pine Dawn', bg: '#FAF4ED', fg: '#575279', accent: '#D7827E' },
];

export const DARK_PRESETS: ThemePreset[] = [
  { id: 'Default Dark', label: 'Default Dark', bg: '#101010', fg: '#CCCCCC', accent: '#007ACC' },
  { id: 'Aidev Dark', label: 'Aidev Dark', bg: '#121214', fg: '#DEDEDE', accent: '#3B82F6' },
  { id: 'GitHub Dark', label: 'GitHub Dark', bg: '#0D1117', fg: '#C9D1D9', accent: '#58A6FF' },
  { id: 'OLED Black', label: 'OLED Black', bg: '#000000', fg: '#E5E5E5', accent: '#007ACC' },
  { id: 'Tokyo Night', label: 'Tokyo Night', bg: '#1A1B26', fg: '#A9B1D6', accent: '#7AA2F7' },
  { id: 'Dracula', label: 'Dracula', bg: '#282A36', fg: '#F8F8F2', accent: '#BD93F9' },
  { id: 'Monokai', label: 'Monokai', bg: '#272822', fg: '#F8F8F2', accent: '#FD971F' },
  { id: 'Nord', label: 'Nord', bg: '#2E3440', fg: '#ECEFF4', accent: '#88C0D0' },
];

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  chatWidth: ChatWidthMode;
  chatWidthClass: string;
  lightPreset: string;
  darkPreset: string;
  contrast: 'default' | 'strong';
  setTheme: (t: ThemeMode) => void;
  setChatWidth: (w: ChatWidthMode) => void;
  setLightPreset: (presetId: string) => void;
  setDarkPreset: (presetId: string) => void;
  setContrast: (c: 'default' | 'strong') => void;
  setCustomColor: (mode: 'light' | 'dark', field: 'bg' | 'fg' | 'accent', value: string) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [systemDark, setSystemDark] = useState<boolean>(true);
  const [chatWidth, setChatWidthState] = useState<ChatWidthMode>('default');
  const [lightPreset, setLightPresetState] = useState<string>('Default Light');
  const [darkPreset, setDarkPresetState] = useState<string>('Default Dark');
  const [contrast, setContrastState] = useState<'default' | 'strong'>('default');
  const [customColors, setCustomColors] = useState<{
    light?: Partial<ThemePreset>;
    dark?: Partial<ThemePreset>;
  }>({});

  // Hydrate from localStorage on client mount, fallback to /api/config
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedTheme = localStorage.getItem('aidev_theme') as ThemeMode;
    if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
      setThemeState(savedTheme);
    } else {
      fetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data?.settings?.theme) {
            setThemeState(data.settings.theme as ThemeMode);
            localStorage.setItem('aidev_theme', data.settings.theme);
          }
        })
        .catch(() => {});
    }

    const savedContrast = localStorage.getItem('aidev_contrast') as 'default' | 'strong';
    if (savedContrast === 'default' || savedContrast === 'strong') {
      setContrastState(savedContrast);
    }

    const savedWidth = localStorage.getItem('aidev_chat_width') as ChatWidthMode;
    if (savedWidth === 'narrow' || savedWidth === 'default' || savedWidth === 'wide') {
      setChatWidthState(savedWidth);
    }

    const savedLight = localStorage.getItem('aidev_light_preset');
    if (savedLight) setLightPresetState(savedLight);

    const savedDark = localStorage.getItem('aidev_dark_preset');
    if (savedDark) setDarkPresetState(savedDark);

    const savedCustom = localStorage.getItem('aidev_custom_colors');
    if (savedCustom) {
      try {
        setCustomColors(JSON.parse(savedCustom));
      } catch {}
    }

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mql.matches);

    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return systemDark ? 'dark' : 'light';
    }
    return theme;
  }, [theme, systemDark]);

  const chatWidthClass = useMemo(() => {
    switch (chatWidth) {
      case 'narrow':
        return 'max-w-2xl';
      case 'wide':
        return 'max-w-5xl';
      default:
        return 'max-w-3xl';
    }
  }, [chatWidth]);

  // Sync DOM classes and CSS variables without full-screen flicker
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = document.documentElement;
    const targetTheme = resolvedTheme;
    const oppositeTheme = resolvedTheme === 'light' ? 'dark' : 'light';

    // Atomic class switch - never remove both classes simultaneously
    if (!root.classList.contains(targetTheme)) {
      root.classList.add(targetTheme);
    }
    if (root.classList.contains(oppositeTheme)) {
      root.classList.remove(oppositeTheme);
    }

    const baseLight = LIGHT_PRESETS.find((p) => p.id === lightPreset) || LIGHT_PRESETS[0];
    const curLight = { ...baseLight, ...customColors.light };

    const baseDark = DARK_PRESETS.find((p) => p.id === darkPreset) || DARK_PRESETS[0];
    const curDark = { ...baseDark, ...customColors.dark };

    if (resolvedTheme === 'light') {
      root.style.setProperty('--background', curLight.bg);
      root.style.setProperty('--foreground', curLight.fg);
      root.style.setProperty('--primary', curLight.accent);
      root.style.setProperty('--card', '#FFFFFF');
      root.style.setProperty('--card-border', '#E5E5E8');
      root.style.setProperty('--sidebar', '#F4F4F7');
      root.style.setProperty('--sidebar-secondary', '#EAECEE');
      root.style.setProperty('--border', '#E2E2E7');
      root.style.setProperty('--secondary', '#ECECEE');
      root.style.setProperty('--secondary-foreground', '#222225');
    } else {
      root.style.setProperty('--background', curDark.bg);
      root.style.setProperty('--foreground', curDark.fg);
      root.style.setProperty('--primary', curDark.accent);
      // Let card and sidebar naturally harmonize with dark background if not default
      const isOled = curDark.bg === '#000000';
      root.style.setProperty('--card', isOled ? '#080808' : '#161619');
      root.style.setProperty('--card-border', isOled ? '#1f1f1f' : '#26262c');
      root.style.setProperty('--sidebar', isOled ? '#000000' : '#0e0e11');
      root.style.setProperty('--sidebar-secondary', isOled ? '#0d0d0d' : '#16161b');
      root.style.setProperty('--border', isOled ? '#1c1c1c' : '#1e1e24');
      root.style.setProperty('--secondary', isOled ? '#141414' : '#232328');
      root.style.setProperty('--secondary-foreground', '#9D9D9D');
    }

    if (contrast === 'strong') {
      if (!root.classList.contains('strong-contrast')) root.classList.add('strong-contrast');
    } else {
      if (root.classList.contains('strong-contrast')) root.classList.remove('strong-contrast');
    }
  }, [resolvedTheme, lightPreset, darkPreset, contrast, customColors]);

  const setCustomColor = (mode: 'light' | 'dark', field: 'bg' | 'fg' | 'accent', value: string) => {
    setCustomColors((prev) => {
      const next = {
        ...prev,
        [mode]: {
          ...(prev[mode] || {}),
          [field]: value,
        },
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('aidev_custom_colors', JSON.stringify(next));
      }
      return next;
    });
  };

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_theme', t);
    }
  };

  const setContrast = (c: 'default' | 'strong') => {
    setContrastState(c);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_contrast', c);
    }
  };

  const setChatWidth = (w: ChatWidthMode) => {
    setChatWidthState(w);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_chat_width', w);
    }
  };

  const setLightPreset = (presetId: string) => {
    setLightPresetState(presetId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_light_preset', presetId);
    }
  };

  const setDarkPreset = (presetId: string) => {
    setDarkPresetState(presetId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_dark_preset', presetId);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        chatWidth,
        chatWidthClass,
        lightPreset,
        darkPreset,
        contrast,
        setTheme,
        setChatWidth,
        setLightPreset,
        setDarkPreset,
        setContrast,
        setCustomColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'dark' as ThemeMode,
      resolvedTheme: 'dark' as ResolvedTheme,
      chatWidth: 'default' as ChatWidthMode,
      chatWidthClass: 'max-w-3xl',
      lightPreset: 'Default Light',
      darkPreset: 'Default Dark',
      contrast: 'default' as 'default' | 'strong',
      setTheme: () => {},
      setChatWidth: () => {},
      setLightPreset: () => {},
      setDarkPreset: () => {},
      setContrast: () => {},
      setCustomColor: () => {},
    };
  }
  return context;
};
