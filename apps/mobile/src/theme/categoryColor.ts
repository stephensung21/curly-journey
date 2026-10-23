import type { CategoryColor } from '@curly/core';
import { accents, type ThemeTokens } from './tokens';

/** `line` follows the theme; every other colour is one of the shared accents. */
export function categoryColor(color: CategoryColor, t: ThemeTokens): string {
  return color === 'line' ? t.line : accents[color];
}
