export type Mode = 'dark' | 'light';

export type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceSunken: string;
  surfaceEdge: string;
  line: string;
  ink: string;
  inkMuted: string;
  inkFaded: string;
  inkOnAccent: string;
  noteLime: string;
  notePink: string;
  strokeLime: string;
  strokeYellow: string;
  chartLime: string;
};

/** Accent fills are the same in both modes (visual spec §2.1). */
export const accents = {
  orange: '#ff7a45',
  lime: '#c6f36b',
  blue: '#7aa2ff',
  yellow: '#ffd23f',
  pink: '#ff8fb1',
  purple: '#b69cff',
  cream: '#fff4ea',
  spendRed: '#ff5c5c',
} as const;

const inkOnAccent = '#16131f';

export const themes: Record<Mode, ThemeTokens> = {
  dark: {
    bg: '#241f31',
    surface: '#342c47',
    surfaceSunken: '#241f31',
    surfaceEdge: 'transparent',
    line: '#4a4163',
    ink: '#f4efe6',
    inkMuted: '#c4bdd4',
    inkFaded: '#7d7494',
    inkOnAccent,
    noteLime: '#c6f36b',
    notePink: '#ff8fb1',
    strokeLime: '#c6f36b',
    strokeYellow: '#ffd23f',
    chartLime: '#c6f36b',
  },
  light: {
    bg: '#f6efe3',
    surface: '#ffffff',
    surfaceSunken: '#f6efe3',
    surfaceEdge: '#ddd1bd',
    line: '#ddd1bd',
    ink: '#241f31',
    inkMuted: '#625a76',
    inkFaded: '#a69d8c',
    inkOnAccent,
    noteLime: '#4c7a0e',
    notePink: '#c2416b',
    strokeLime: '#5f9412',
    strokeYellow: '#e0a100',
    chartLime: '#5f9412',
  },
};

/** An unknown system scheme falls back to dark, the app's primary look. */
export function resolveMode(setting: 'system' | Mode, system: Mode | null | undefined): Mode {
  if (setting !== 'system') return setting;
  return system ?? 'dark';
}
