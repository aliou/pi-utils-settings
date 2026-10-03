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
 * ./settings-panel; tab primitives live in ./settings-tabs.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { ConfigStore, Scope } from "./config-loader";
import {
  type ExtraSettingsTab,
  type ScopeSectionsBuilder,
  SettingsPanel,
} from "./settings-panel";
import { ALL_SCOPE_IDS, toSettingsTabs } from "./settings-tabs";

export {
  defaultChangeHandler,
  type ExtraSettingsTab,
  type ExtraSettingsTabChangeContext,
  type ExtraSettingsTabContext,
} from "./settings-panel";

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

  pi.registerCommand(commandName, {
    description,
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const enabledScopes = configStore.getEnabledScopes();
      const tabs = toSettingsTabs(enabledScopes, extraTabs);
      if (tabs.length === 0) {
        ctx.ui.notify("No tabs configured", "error");
        return;
      }

      // Default to first scope with existing config, else first scope, else first tab.
      const activeTabId =
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
    },
  });
}
