/**
 * Shared settings domain types: config scopes, settings tabs, and the
 * section-builder contracts used by both the command registration and the
 * panel component.
 */

import type { SettingsSection } from "./components/sectioned-settings";
import type { SettingsTheme } from "./theme";

/** Config scopes, in merge priority order (lowest to highest). */
export type Scope = "global" | "local" | "memory";

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

export interface ScopeSectionsContext<TConfig extends object> {
  setDraft: (config: TConfig) => void;
  scope: Scope;
  isInherited: (path: string) => boolean;
  theme: SettingsTheme;
}

export type ScopeSectionsBuilder<
  TConfig extends object,
  TResolved extends object,
> = (
  tabConfig: TConfig | null,
  resolved: TResolved,
  ctx: ScopeSectionsContext<TConfig>,
) => SettingsSection[];

export interface ExtraSettingsTabContext<
  TConfig extends object,
  TResolved extends object,
> {
  resolved: TResolved;
  setDraftForScope: (scope: Scope, config: TConfig) => void;
  getDraftForScope: (scope: Scope) => TConfig | null;
  getRawForScope: (scope: Scope) => TConfig | null;
  enabledScopes: Scope[];
  theme: SettingsTheme;
}

export interface ExtraSettingsTabChangeContext<
  TConfig extends object,
  TResolved extends object,
> extends ExtraSettingsTabContext<TConfig, TResolved> {
  /**
   * Apply the command-level onSettingChange/default change handler to a scope
   * draft. Use this for value-cycling items rendered in extra tabs.
   */
  applySettingChangeToScope: (
    scope: Scope,
    id: string,
    newValue: string,
  ) => void;
}

export interface ExtraSettingsTab<
  TConfig extends object,
  TResolved extends object,
> {
  /** Unique tab id. Must not collide with scope ids (global/local/memory). */
  id: string;
  /** Tab label shown in top tab row. */
  label: string;
  /** Build sections for this extra tab. */
  buildSections: (
    ctx: ExtraSettingsTabContext<TConfig, TResolved>,
  ) => SettingsSection[];
  /**
   * Optional value-cycling handler for non-submenu items in this extra tab.
   * Extra tabs are not scope-bound, so call ctx.applySettingChangeToScope(...)
   * or ctx.setDraftForScope(...) to choose which scope draft should change.
   */
  onSettingChange?: (
    id: string,
    newValue: string,
    ctx: ExtraSettingsTabChangeContext<TConfig, TResolved>,
  ) => void;
}
