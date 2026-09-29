import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Theme registry
// ---------------------------------------------------------------------------

export type ThemeId =
  | "dark"
  | "light"
  | "catppuccin"
  | "tokyo-night"
  | "dracula"
  | "ayu-dark"
  | "github-dark"
  | "atom-one-dark"
  | "night-owl"
  | "monokai-pro"
  | "one-dark-pro"
  | "solarized-light";

export interface ThemeMeta {
  readonly id: ThemeId;
  readonly label: string;
  readonly kind: "dark" | "light";
  /** Swatch colors shown in the theme picker card: [bg, sidebar, accent, syntax1, syntax2, syntax3] */
  readonly swatches: readonly [string, string, string, string, string, string];
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: "dark",
    label: "Dark Modern",
    kind: "dark",
    swatches: ["#1e1e1e", "#252526", "#007acc", "#569cd6", "#4ec9b0", "#ce9178"],
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    kind: "dark",
    swatches: ["#1e1e2e", "#181825", "#89b4fa", "#cba6f7", "#a6e3a1", "#fab387"],
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    kind: "dark",
    swatches: ["#1a1b26", "#16161e", "#7aa2f7", "#bb9af7", "#9ece6a", "#e0af68"],
  },
  {
    id: "dracula",
    label: "Dracula",
    kind: "dark",
    swatches: ["#282a36", "#21222c", "#bd93f9", "#ff79c6", "#50fa7b", "#f1fa8c"],
  },
  {
    id: "ayu-dark",
    label: "Ayu Dark",
    kind: "dark",
    swatches: ["#0d1017", "#0d1017", "#e6b450", "#39bae6", "#7fd962", "#ff8f40"],
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    kind: "dark",
    swatches: ["#0d1117", "#161b22", "#2f81f7", "#ff7b72", "#79c0ff", "#a5d6ff"],
  },
  {
    id: "atom-one-dark",
    label: "Atom One Dark",
    kind: "dark",
    swatches: ["#282c34", "#21252b", "#61afef", "#e06c75", "#98c379", "#e5c07b"],
  },
  {
    id: "night-owl",
    label: "Night Owl",
    kind: "dark",
    swatches: ["#011627", "#010f1a", "#82aaff", "#c792ea", "#addb67", "#ffcb8b"],
  },
  {
    id: "monokai-pro",
    label: "Monokai Pro",
    kind: "dark",
    swatches: ["#2d2a2e", "#221f22", "#ff6188", "#fc9867", "#a9dc76", "#78dce8"],
  },
  {
    id: "one-dark-pro",
    label: "One Dark Pro",
    kind: "dark",
    swatches: ["#282c34", "#21252b", "#e5c07b", "#e06c75", "#98c379", "#56b6c2"],
  },
  {
    id: "light",
    label: "Light",
    kind: "light",
    swatches: ["#ffffff", "#f3f3f3", "#0066bf", "#0451a5", "#008000", "#a31515"],
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    kind: "light",
    swatches: ["#fdf6e3", "#eee8d5", "#268bd2", "#d33682", "#859900", "#b58900"],
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const STORAGE_KEY = "codefy:theme";

interface ThemeContextValue {
  readonly theme: ThemeId;
  readonly setTheme: (id: ThemeId) => void;
  readonly themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => void 0,
  themes: THEMES,
});

function resolveInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId;
  } catch {
    // ignore
  }
  return "dark";
}

function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

export function ThemeProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [theme, setThemeState] = useState<ThemeId>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    applyTheme(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

