/**
 * Settings command registration helper.
 *
 * Creates a /{name}:settings command with tabs for enabled scopes
 * and optional extra top-level tabs.
 * Changes are tracked in memory. Ctrl+S saves scope drafts,
 * Esc exits without saving.
 *
 * Registration throws ([settings]-prefixed errors) on invalid options,
 * before any command is registered. The settings UI itself lives in
 * components/settings-panel.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { SettingsPanel } from "./components/settings-panel";
import type { ConfigStore } from "./config/loader";
import {
  ALL_SCOPE_IDS,
  type ExtraSettingsTab,
  matchTabToken,
  type Scope,
  type ScopeSectionsBuilder,
  type SettingsTab,
  tabCompletions,
  toSettingsTabs,
} from "./types";

/** A shortcut command that opens the settings UI on a preselected tab. */
export interface SettingsCommandAlias {
  /** Full command name to register, e.g. "aperture:proxy". */
  commandName: string;
  /** Tab to open initially: a scope id or an extraTabs id. */
  tabId: string;
  /** Palette description. Default: `Open ${title} (${tabLabel})`. */
  description?: string;
}

export interface SettingsCommandOptions<
  TConfig extends object,
  TResolved extends object,
> {
  /** Command name, e.g. "toolchain:settings" */
  commandName: string;
  /** Command description for the command palette. */
  commandDescription?: string;
  /** Title shown at the top of the settings UI. */
  title: string;
  /** Config store (ConfigLoader or custom implementation). */
  configStore: ConfigStore<TConfig, TResolved>;
  /**
   * Build the sections for scope tabs.
   * Called on initial render, tab switch, and after saving.
   *
   * Use ctx.setDraft in submenu onSave callbacks to store changes
   * in the draft. Use ctx.theme when you need styling helpers that
   * work for both SettingsListTheme and full Theme consumers.
   * All changes (toggles, enums, submenus) are only persisted to disk
   * on Ctrl+S.
   *
   * For memory scope, tabConfig is null when no overrides exist yet.
   * Use resolved values as display values in that case.
   */
  buildSections: ScopeSectionsBuilder<TConfig, TResolved>;
  /** Optional extra tabs rendered after scope tabs. */
  extraTabs?: ExtraSettingsTab<TConfig, TResolved>[];
  /** Optional alias commands that open the settings UI on a preselected tab. */
  aliases?: SettingsCommandAlias[];
  /**
   * Custom change handler. Receives the setting ID, new display value,
   * and a clone of the current tab config. Return the updated config.
   *
   * If not provided, the default handler stores the raw string value as-is
   * via dotted path. Use this to convert display values (e.g., "on"/"off")
   * to storage types (booleans, numbers, etc.). Return null to fall through
   * to the default string storage.
   */
  onSettingChange?: (
    id: string,
    newValue: string,
    config: TConfig,
  ) => TConfig | null;
  /**
   * Called before the settings UI closes via top-level Esc.
   * Return false to keep the UI open, for example to confirm discarding drafts.
   */
  onBeforeClose?: (isDirty: boolean) => boolean;
  /**
   * Called after save succeeds. Use this to reload runtime state
   * that was captured at extension init time.
   */
  onSave?: (ctx: ExtensionCommandContext) => void | Promise<void>;
  /**
   * Fixed content height (in lines) for the settings body, passed to
   * SectionedSettings. The item list window shrinks to make room for the
   * selected item's fully wrapped, bottom-anchored description so the
   * panel height stays stable across tabs and cursor moves.
   * Default: 20.
   */
  contentHeight?: number;
}

export function registerSettingsCommand<
  TConfig extends object,
  TResolved extends object,
>(pi: ExtensionAPI, options: SettingsCommandOptions<TConfig, TResolved>): void {
  const {
    commandName,
    title,
    configStore,
    buildSections,
    onSettingChange,
    onBeforeClose,
    onSave,
    contentHeight = 20,
  } = options;
  const description =
    options.commandDescription ??
    `Configure ${commandName.split(":")[0]} settings`;
  const extensionLabel = commandName.split(":")[0] ?? title;

  const extraTabs = options.extraTabs ?? [];
  const reservedScopeIds = new Set<Scope>(ALL_SCOPE_IDS);
  const seenExtraIds = new Set<string>();
  for (const tab of extraTabs) {
    if (reservedScopeIds.has(tab.id as Scope)) {
      throw new Error(
        `[settings] extraTabs id "${tab.id}" collides with reserved scope id`,
      );
    }
    if (seenExtraIds.has(tab.id)) {
      throw new Error(`[settings] Duplicate extraTabs id "${tab.id}"`);
    }
    seenExtraIds.add(tab.id);
  }

  const staticTabs: SettingsTab[] = toSettingsTabs(ALL_SCOPE_IDS, extraTabs);
  const staticTabLabels = new Map(staticTabs.map((tab) => [tab.id, tab.label]));

  const aliases = options.aliases ?? [];
  const seenAliasNames = new Set<string>();
  for (const alias of aliases) {
    if (alias.commandName === commandName) {
      throw new Error(
        `[settings] Alias commandName "${alias.commandName}" collides with the main command name`,
      );
    }
    if (seenAliasNames.has(alias.commandName)) {
      throw new Error(
        `[settings] Duplicate alias commandName "${alias.commandName}"`,
      );
    }
    seenAliasNames.add(alias.commandName);
    if (!staticTabLabels.has(alias.tabId)) {
      throw new Error(
        `[settings] Alias "${alias.commandName}" references unknown tab "${alias.tabId}"`,
      );
    }
  }

  async function openSettings(
    args: string,
    ctx: ExtensionCommandContext,
    initialTabId?: string,
  ): Promise<void> {
    if (!ctx.hasUI) return;

    const enabledScopes = configStore.getEnabledScopes();
    const tabs = toSettingsTabs(enabledScopes, extraTabs);
    if (tabs.length === 0) {
      ctx.ui.notify("No tabs configured", "error");
      return;
    }

    let requestedTabId = initialTabId;
    if (requestedTabId === undefined) {
      const token = args.trim().split(/\s+/)[0] ?? "";
      if (token) {
        const matched = matchTabToken(token, staticTabs);
        if (matched) {
          requestedTabId = matched.id;
        } else {
          ctx.ui.notify(`Unknown tab '${token}'`, "warning");
        }
      }
    }

    const registeredTabIds = new Set(tabs.map((tab) => tab.id));
    const activeTabId =
      (requestedTabId !== undefined && registeredTabIds.has(requestedTabId)
        ? requestedTabId
        : undefined) ??
      enabledScopes.find((s) => configStore.hasConfig(s)) ??
      enabledScopes[0] ??
      tabs[0]?.id ??
      "";

    await ctx.ui.custom(
      (tui, theme, _kb, done) =>
        new SettingsPanel({
          title,
          extensionLabel,
          configStore,
          buildSections,
          onSettingChange,
          onBeforeClose,
          onSave,
          contentHeight,
          extraTabs,
          enabledScopes,
          tabs,
          activeTabId,
          ctx,
          tui,
          theme,
          onClose: () => done(undefined),
        }),
    );
  }

  pi.registerCommand(commandName, {
    description,
    getArgumentCompletions: (argumentPrefix) =>
      tabCompletions(
        toSettingsTabs(configStore.getEnabledScopes(), extraTabs),
        argumentPrefix,
      ),
    handler: (args, ctx) => openSettings(args, ctx),
  });

  for (const alias of aliases) {
    const tabLabel = staticTabLabels.get(alias.tabId) ?? alias.tabId;
    pi.registerCommand(alias.commandName, {
      description: alias.description ?? `Open ${title} (${tabLabel})`,
      handler: (_args, ctx) => openSettings("", ctx, alias.tabId),
    });
  }
}
