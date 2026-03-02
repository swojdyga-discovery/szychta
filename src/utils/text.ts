/**
 * Centralised UI texts that depend on gorolMode.
 * Import `getLoadingText` (or future helpers) instead of
 * inlining ternaries everywhere.
 */

export function getLoadingText(gorolMode?: boolean): string {
  return gorolMode ? 'Ładowanie...' : 'Czekej, ładuja...';
}
