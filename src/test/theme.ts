import type { SettingsListTheme } from "@earendil-works/pi-tui";

/**
 * Identity-styled settings theme for render assertions: every styling
 * helper returns its input unchanged, so rendered output can be asserted
 * with plain string matching.
 */
export function createSettingsListTheme(
  overrides: Partial<SettingsListTheme> = {},
): SettingsListTheme {
  return {
    cursor: "→ ",
    label: (text: string) => text,
    value: (text: string) => text,
    description: (text: string) => text,
    hint: (text: string) => text,
    ...overrides,
  } as SettingsListTheme;
}
