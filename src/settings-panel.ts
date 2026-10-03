/**
 * The framed settings panel rendered by registerSettingsCommand:
 * top tabs, a SectionedSettings body, and exactly one shortcut line.
 *
 * One instance is one open settings session. All session state (drafts,
 * active tab, open submenu) lives on the instance; changes are tracked
 * in memory and only persisted by save() (Ctrl+S).
 */

import type {
  ExtensionCommandContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  SectionedSettings,
  type SettingsSection,
} from "./components/sectioned-settings";
import type { ConfigStore, Scope } from "./config-loader";
import { getNestedValue, setNestedValue } from "./helpers";
import { SCOPE_LABELS, type SettingsTab } from "./settings-tabs";
import { getSettingsTheme, type SettingsTheme } from "./theme";

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

/** Default change handler: stores raw strings as-is via dotted path. */
export function defaultChangeHandler<TConfig extends object>(
  id: string,
  newValue: string,
  config: TConfig,
): TConfig {
  const updated = structuredClone(config);
  setNestedValue(updated, id, newValue);
  return updated;
}

/**
 * Find whether an item in the given sections has a submenu.
 * Used to distinguish value cycling (track draft) from submenu close (refresh only).
 */
function isSubmenuItem(sections: SettingsSection[], id: string): boolean {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.id === id && item.submenu) return true;
    }
  }
  return false;
}

export interface SettingsPanelOptions<
  TConfig extends object,
  TResolved extends object,
> {
  title: string;
  extensionLabel: string;
  configStore: ConfigStore<TConfig, TResolved>;
  buildSections: ScopeSectionsBuilder<TConfig, TResolved>;
  onSettingChange?: (
    id: string,
    newValue: string,
    config: TConfig,
  ) => TConfig | null;
  onBeforeClose?: (isDirty: boolean) => boolean;
  onSave?: (ctx: ExtensionCommandContext) => void | Promise<void>;
  contentHeight: number;
  extraTabs: ExtraSettingsTab<TConfig, TResolved>[];
  enabledScopes: Scope[];
  tabs: SettingsTab[];
  activeTabId: string;
  ctx: ExtensionCommandContext;
  tui: TUI;
  theme: Theme;
  onClose: () => void;
}

export class SettingsPanel<TConfig extends object, TResolved extends object>
  implements Component
{
  private readonly title: string;
  private readonly extensionLabel: string;
  private readonly configStore: ConfigStore<TConfig, TResolved>;
  private readonly buildSections: SettingsPanelOptions<
    TConfig,
    TResolved
  >["buildSections"];
  private readonly onSettingChange?: SettingsPanelOptions<
    TConfig,
    TResolved
  >["onSettingChange"];
  private readonly onBeforeClose?: SettingsPanelOptions<
    TConfig,
    TResolved
  >["onBeforeClose"];
  private readonly onSave?: SettingsPanelOptions<TConfig, TResolved>["onSave"];
  private readonly contentHeight: number;
  private readonly extraTabsById: Map<
    string,
    ExtraSettingsTab<TConfig, TResolved>
  >;
  private readonly enabledScopes: Scope[];
  private readonly enabledScopeIds: Set<Scope>;
  private readonly tabs: SettingsTab[];
  private readonly ctx: ExtensionCommandContext;
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly settingsTheme: SettingsTheme;
  private readonly onClose: () => void;

  private activeTabId: string;
  private settings: SectionedSettings | null = null;
  private currentSections: SettingsSection[] = [];
  private drafts: Partial<Record<Scope, TConfig | null>> = {};

  constructor(options: SettingsPanelOptions<TConfig, TResolved>) {
    this.title = options.title;
    this.extensionLabel = options.extensionLabel;
    this.configStore = options.configStore;
    this.buildSections = options.buildSections;
    this.onSettingChange = options.onSettingChange;
    this.onBeforeClose = options.onBeforeClose;
    this.onSave = options.onSave;
    this.contentHeight = options.contentHeight;
    this.extraTabsById = new Map(options.extraTabs.map((tab) => [tab.id, tab]));
    this.enabledScopes = options.enabledScopes;
    this.enabledScopeIds = new Set(options.enabledScopes);
    this.tabs = options.tabs;
    this.activeTabId = options.activeTabId;
    this.ctx = options.ctx;
    this.tui = options.tui;
    this.theme = options.theme;
    this.settingsTheme = getSettingsTheme(options.theme);
    this.onClose = options.onClose;

    // Per-scope draft configs. null = no changes from disk/memory.
    for (const scope of this.enabledScopes) {
      this.drafts[scope] = null;
    }

    this.settings = this.buildList(this.activeTabId);
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const contentWidth = Math.max(1, width - 2);

    // Top border with title
    const titleText = ` ${this.title} `;
    const titleLen = visibleWidth(titleText);
    const topRuleLen = Math.max(1, width - titleLen - 3);
    lines.push(
      this.theme.fg("border", "╭─") +
        this.theme.fg("accent", this.theme.bold(titleText)) +
        this.theme.fg("border", "─".repeat(topRuleLen)) +
        this.theme.fg("border", "╮"),
    );

    // Tabs
    const tabs = this.renderTabs();
    if (tabs) {
      lines.push(this.padLine(tabs, contentWidth));
    }
    lines.push(this.padLine("", contentWidth));

    // Settings content
    const innerLines = this.settings?.render(contentWidth) ?? [];
    for (const line of innerLines) {
      lines.push(this.padLine(line, contentWidth));
    }

    // Separator
    lines.push(
      this.theme.fg("border", "├") +
        this.theme.fg("border", "─".repeat(contentWidth)) +
        this.theme.fg("border", "┤"),
    );

    // Controls: exactly one shortcut line at all times. While a
    // submenu is open, show the submenu's own shortcuts (accurate
    // for its context, e.g. "Esc back" instead of "Esc close");
    // fall back to the default controls when the submenu exposes
    // none. Ctrl+S still saves from any depth even though the
    // submenu line may not mention it.
    const submenuShortcuts = this.settings?.getActiveSubmenuShortcuts();
    let controlsText: string;
    if (submenuShortcuts) {
      controlsText = this.theme.fg("dim", ` ${submenuShortcuts}`);
    } else {
      const parts = ["Enter/Space change"];
      if (this.tabs.length > 1) {
        parts.push("Tab/Shift+Tab tab");
      }
      parts.push("Ctrl+S save", "Esc close");
      controlsText = this.theme.fg("dim", ` ${parts.join(" · ")}`);
    }
    lines.push(this.padLine(controlsText, contentWidth));

    // Bottom border
    lines.push(
      this.theme.fg("border", "╰") +
        this.theme.fg("border", "─".repeat(contentWidth)) +
        this.theme.fg("border", "╯"),
    );

    return lines;
  }

  invalidate(): void {
    this.settings?.invalidate?.();
  }

  handleInput(data: string): void {
    const hasActiveSubmenu = this.settings?.hasActiveSubmenu() ?? false;

    if (matchesKey(data, Key.escape) && !hasActiveSubmenu) {
      this.requestClose();
      return;
    }

    // Ctrl+S: save all dirty scope tabs, from any depth. Submenus
    // commit edits to the draft on every mutation, so the draft is
    // always current; intercept here so submenus never see the key.
    if (matchesKey(data, Key.ctrl("s"))) {
      if (this.isDirty()) void this.save();
      return;
    }

    if (!hasActiveSubmenu && this.handleTabSwitch(data)) return;
    this.settings?.handleInput?.(data);
    this.tui.requestRender();
  }

  private isScopeTabId(tabId: string): tabId is Scope {
    return this.enabledScopeIds.has(tabId as Scope);
  }

  /** Get the effective config for a scope (draft or stored). */
  private getScopeTabConfig(scope: Scope): TConfig | null {
    return this.drafts[scope] ?? this.configStore.getRawConfig(scope);
  }

  /**
   * For memory scope: check if a path has a value in memory config.
   * If not, it's inherited from lower-priority scopes.
   */
  private isInherited(scope: Scope, path: string): boolean {
    if (scope !== "memory") return false;
    const memoryConfig =
      this.drafts.memory ?? this.configStore.getRawConfig("memory");
    if (!memoryConfig) return true; // No memory config = all inherited
    return getNestedValue(memoryConfig, path) === undefined;
  }

  private setDraftForScope(scope: Scope, config: TConfig): void {
    if (!this.enabledScopeIds.has(scope)) {
      throw new Error(`[settings] Scope "${scope}" is not enabled`);
    }
    this.drafts[scope] = config;
  }

  private getDraftForScope(scope: Scope): TConfig | null {
    if (!this.enabledScopeIds.has(scope)) return null;
    return this.drafts[scope] ?? null;
  }

  private getRawForScope(scope: Scope): TConfig | null {
    if (!this.enabledScopeIds.has(scope)) return null;
    return this.configStore.getRawConfig(scope);
  }

  private isDirty(): boolean {
    return this.enabledScopes.some((scope) => this.drafts[scope] !== null);
  }

  private requestClose(): void {
    if (this.onBeforeClose && !this.onBeforeClose(this.isDirty())) {
      this.tui.requestRender();
      return;
    }
    this.onClose();
  }

  private requestSave(): void {
    if (this.isDirty()) void this.save();
  }

  private getSectionsForTab(tabId: string): SettingsSection[] {
    const resolved = this.configStore.getConfig();

    if (this.isScopeTabId(tabId)) {
      const tabConfig = this.getScopeTabConfig(tabId);
      this.currentSections = this.buildSections(tabConfig, resolved, {
        setDraft: (config) => {
          this.setDraftForScope(tabId, config);
        },
        scope: tabId,
        isInherited: (path) => this.isInherited(tabId, path),
        theme: this.settingsTheme,
      });
      return this.currentSections;
    }

    const extraTab = this.extraTabsById.get(tabId);
    if (!extraTab) {
      this.currentSections = [];
      return this.currentSections;
    }

    this.currentSections = extraTab.buildSections(this.getExtraTabContext());
    return this.currentSections;
  }

  private refresh(): void {
    this.settings?.updateSections(this.getSectionsForTab(this.activeTabId));
    this.tui.requestRender();
  }

  private buildList(tabId: string): SectionedSettings {
    return new SectionedSettings({
      sections: this.getSectionsForTab(tabId),
      theme: this.settingsTheme,
      onChange: (id, newValue) => {
        if (this.isScopeTabId(tabId)) {
          this.handleScopeChange(tabId, id, newValue);
          return;
        }
        this.handleExtraTabChange(tabId, id, newValue);
      },
      onCancel: () => this.requestClose(),
      enableSearch: true,
      hideHint: true,
      requestRender: () => this.tui.requestRender(),
      requestSave: () => this.requestSave(),
      // Fixed body height; the list window shrinks to make room
      // for the selected item's fully wrapped description.
      contentHeight: this.contentHeight,
    });
  }

  private applySettingChangeToScope(
    scope: Scope,
    id: string,
    newValue: string,
  ): void {
    // For memory scope with no existing config, start from merged config
    let current = this.getScopeTabConfig(scope);
    if (scope === "memory" && current === null) {
      current = this.configStore.getConfig() as unknown as TConfig;
    }

    const baseConfig = structuredClone(current ?? ({} as TConfig));
    const updated =
      this.onSettingChange?.(id, newValue, structuredClone(baseConfig)) ??
      defaultChangeHandler(id, newValue, structuredClone(baseConfig));

    // Store in draft, don't write to disk yet.
    this.setDraftForScope(scope, updated);
  }

  private getExtraTabContext(): ExtraSettingsTabChangeContext<
    TConfig,
    TResolved
  > {
    return {
      resolved: this.configStore.getConfig(),
      setDraftForScope: (scope, config) => this.setDraftForScope(scope, config),
      getDraftForScope: (scope) => this.getDraftForScope(scope),
      getRawForScope: (scope) => this.getRawForScope(scope),
      enabledScopes: this.enabledScopes,
      theme: this.settingsTheme,
      applySettingChangeToScope: (scope, id, newValue) =>
        this.applySettingChangeToScope(scope, id, newValue),
    };
  }

  private handleScopeChange(scope: Scope, id: string, newValue: string): void {
    // Submenu items handle their own saving.
    if (isSubmenuItem(this.currentSections, id)) {
      this.refresh();
      return;
    }

    this.applySettingChangeToScope(scope, id, newValue);
    this.refresh();
  }

  private handleExtraTabChange(
    tabId: string,
    id: string,
    newValue: string,
  ): void {
    // Submenu items handle their own saving.
    if (isSubmenuItem(this.currentSections, id)) {
      this.refresh();
      return;
    }

    const extraTab = this.extraTabsById.get(tabId);
    extraTab?.onSettingChange?.(id, newValue, this.getExtraTabContext());
    this.refresh();
  }

  private async save(): Promise<void> {
    let saved = false;

    for (const scope of this.enabledScopes) {
      const draft = this.drafts[scope];
      if (!draft) continue;

      try {
        await this.configStore.save(scope, draft);
        this.drafts[scope] = null;
        saved = true;
      } catch (error) {
        this.ctx.ui.notify(
          `Failed to save ${SCOPE_LABELS[scope]}: ${error}`,
          "error",
        );
      }
    }

    if (saved) {
      this.ctx.ui.notify(`${this.extensionLabel}: saved`, "info");
      if (this.onSave) await this.onSave(this.ctx);
      // Rebuild with fresh data.
      this.settings = this.buildList(this.activeTabId);
    }

    this.tui.requestRender();
  }

  private renderTabs(): string {
    if (this.tabs.length <= 1) {
      return "";
    }

    const tabLabels = this.tabs.map((tab) => {
      const dirtyMark = tab.kind === "scope" && this.drafts[tab.id] ? " *" : "";
      const fullLabel = ` ${tab.label}${dirtyMark} `;

      if (tab.id === this.activeTabId) {
        return this.theme.bg("selectedBg", this.theme.fg("accent", fullLabel));
      }
      return this.theme.fg("dim", fullLabel);
    });

    return tabLabels.join("  ");
  }

  private padLine(content: string, contentWidth: number): string {
    const len = visibleWidth(content);
    const padding = Math.max(0, contentWidth - len);
    return (
      this.theme.fg("border", "│") +
      truncateToWidth(content, contentWidth) +
      " ".repeat(padding) +
      this.theme.fg("border", "│")
    );
  }

  private handleTabSwitch(data: string): boolean {
    if (this.tabs.length <= 1) return false;

    if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
      const currentIndex = this.tabs.findIndex(
        (tab) => tab.id === this.activeTabId,
      );
      const direction = matchesKey(data, Key.shift("tab")) ? -1 : 1;
      const nextIndex =
        (currentIndex + direction + this.tabs.length) % this.tabs.length;
      this.activeTabId = this.tabs[nextIndex]?.id ?? this.activeTabId;
      this.settings = this.buildList(this.activeTabId);
      this.tui.requestRender();
      return true;
    }
    return false;
  }
}
