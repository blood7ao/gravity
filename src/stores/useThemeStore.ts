import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'gravity_theme';
const LEGACY_THEME_STORAGE_KEY = 'antigravity_theme';

export type ThemeTransitionEvent =
  | React.MouseEvent<HTMLElement>
  | MouseEvent
  | { clientX?: number; clientY?: number; target?: EventTarget | null; currentTarget?: EventTarget | null }
  | HTMLElement
  | undefined
  | null;

interface ThemeState {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme, event?: ThemeTransitionEvent) => void;
  toggleTheme: (event?: ThemeTransitionEvent) => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

function getInitialTheme(): Theme {
  try {
    const saved = (localStorage.getItem(THEME_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY)) as Theme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (e) {
    console.warn('Failed to read theme from localStorage:', e);
  }
  return 'dark';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

function applyThemeToDOM(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

function getEventCoordinates(event?: ThemeTransitionEvent): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }

  // 1. Direct HTMLElement passed
  if (event instanceof HTMLElement) {
    const rect = event.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  // 2. Event object with clientX and clientY
  if (
    event &&
    typeof event === 'object' &&
    'clientX' in event &&
    'clientY' in event &&
    typeof event.clientX === 'number' &&
    typeof event.clientY === 'number' &&
    (event.clientX !== 0 || event.clientY !== 0)
  ) {
    return { x: event.clientX, y: event.clientY };
  }

  // 3. Event object with currentTarget / target element
  if (event && typeof event === 'object') {
    const targetElement =
      ('currentTarget' in event && event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : 'target' in event && event.target instanceof HTMLElement
        ? event.target
        : null);

    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  }

  // 4. Default to center of window
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
}

function animateThemeChange(
  resolved: ResolvedTheme,
  stateUpdater: () => void,
  event?: ThemeTransitionEvent
) {
  // View Transition API for circular ripple can cause severe frame rate drops 
  // on complex DOMs (like when Monaco editor is rendered).
  // Falling back to instant theme switch to ensure snappy performance.
  flushSync(() => {
    stateUpdater();
  });
}

const initialTheme = getInitialTheme();
const initialResolved = resolveTheme(initialTheme);
applyThemeToDOM(initialResolved);

export const useThemeStore = create<ThemeState>((set, get) => {
  return {
    theme: initialTheme,
    resolvedTheme: initialResolved,
    setTheme: (newTheme: Theme, event?: ThemeTransitionEvent) => {
      const resolved = resolveTheme(newTheme);
      const currentResolved = get().resolvedTheme;

      try {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
        invoke('set_setting', { key: 'theme', value: newTheme }).catch(() => {});
      } catch (e) {
        console.warn('Failed to persist theme:', e);
      }

      // If resolved visual theme does not change (e.g. system=dark and user sets dark), simply update state
      if (currentResolved === resolved) {
        set({
          theme: newTheme,
          resolvedTheme: resolved,
        });
        return;
      }

      animateThemeChange(resolved, () => {
        applyThemeToDOM(resolved);
        set({
          theme: newTheme,
          resolvedTheme: resolved,
        });
      }, event);
    },
    toggleTheme: (event?: ThemeTransitionEvent) => {
      const currentResolved = get().resolvedTheme;
      const nextTheme: Theme = currentResolved === 'dark' ? 'light' : 'dark';
      get().setTheme(nextTheme, event);
    },
  };
});

// Listen for system theme changes
if (typeof window !== 'undefined' && window.matchMedia) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const resolved = getSystemTheme();
      if (state.resolvedTheme !== resolved) {
        animateThemeChange(resolved, () => {
          applyThemeToDOM(resolved);
          useThemeStore.setState({ resolvedTheme: resolved });
        });
      }
    }
  });

  // Sync with database settings on load
  invoke<string | null>('get_setting', { key: 'theme' })
    .then((dbTheme) => {
      if (dbTheme === 'light' || dbTheme === 'dark' || dbTheme === 'system') {
        const current = useThemeStore.getState().theme;
        if (current !== dbTheme) {
          useThemeStore.getState().setTheme(dbTheme as Theme);
        }
      }
    })
    .catch(() => {});
}
