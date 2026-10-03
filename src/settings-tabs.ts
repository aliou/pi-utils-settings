import type { Scope } from "./config-loader";

/** Display labels for each scope */
export const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global",
  local: "Local",
  memory: "Memory",
};

export const ALL_SCOPE_IDS: Scope[] = ["global", "local", "memory"];

export interface ScopeTab {
  kind: "scope";
  id: Scope;
  label: string;
}

export interface ExtraTab {
  kind: "extra";
  id: string;
  label: string;
}

export type SettingsTab = ScopeTab | ExtraTab;

/** Build the tab list for the given scope ids and extra tabs. */
export function toSettingsTabs(
  scopeIds: Scope[],
  extraTabs: { id: string; label: string }[],
): SettingsTab[] {
  return [
    ...scopeIds.map((scope) => ({
      kind: "scope" as const,
      id: scope,
      label: SCOPE_LABELS[scope],
    })),
    ...extraTabs.map((tab) => ({
      kind: "extra" as const,
      id: tab.id,
      label: tab.label,
    })),
  ];
}
