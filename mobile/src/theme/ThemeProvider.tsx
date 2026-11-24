import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type ColorTokens } from './tokens';
import { DEFAULT_MODE, readStoredMode, resolveTheme, storeMode, type ResolvedTheme, type ThemeMode } from './theme';

type ThemeValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: ColorTokens;
  /** Changes the theme. It is remembered on this device unless `save` is false. */
  setMode: (mode: ThemeMode, options?: { save?: boolean }) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children, initialMode }: { children: ReactNode; initialMode?: ThemeMode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? DEFAULT_MODE);
  const [chosen, setChosen] = useState(initialMode !== undefined);

  useEffect(() => {
    if (chosen) return;
    let active = true;
    readStoredMode().then((stored) => {
      if (active) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, [chosen]);

  const value = useMemo<ThemeValue>(() => {
    const resolved = resolveTheme(mode, systemScheme);
    return {
      mode,
      resolved,
      colors: resolved === 'dark' ? dark : light,
      setMode: (next, options) => {
        setChosen(true);
        setModeState(next);
        if (options?.save !== false) void storeMode(next);
      },
    };
  }, [mode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return value;
}
