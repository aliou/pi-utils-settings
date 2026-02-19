/**
 * Settings command for the example extension.
 *
 * Demonstrates:
 * - Multiple sections with different item types
 * - Simple toggle items (on/off, boolean)
 * - Enum items (cycle through values)
 * - Numeric items (cycle through string representations)
 * - Submenu items with ArrayEditor (string arrays)
 * - Submenu items with PathArrayEditor (filesystem paths + tab completion)
 * - Submenu items with FuzzySelector (single-select from large list)
 * - Custom onSettingChange handler for non-string values
 * - onSave callback for reloading runtime state
 */

import {
  ArrayEditor,
  FuzzySelector,
  PathArrayEditor,
  registerSettingsCommand,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  type ExampleConfig,
  type ResolvedExampleConfig,
} from "../config";

const AVAILABLE_THEMES = [
  "dark",
  "light",
  "solarized-dark",
  "solarized-light",
  "monokai",
  "nord",
  "dracula",
  "gruvbox",
  "catppuccin",
  "tokyo-night",
];

export function registerExampleSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<ExampleConfig, ResolvedExampleConfig>(pi, {
    commandName: "example:settings",
    commandDescription: "Configure example extension settings",
    title: "Example Settings",
    configStore: configLoader,

    // --- Build sections ---
    // Called on initial render, tab switch, and after save.
    // tabConfig is the raw config for the active scope (null if empty).
    // resolved is the fully merged config with defaults applied.
    buildSections: (tabConfig, resolved, ctx) => {
      // Read values: prefer tab-specific draft, fall back to resolved.
      const theme = tabConfig?.appearance?.theme ?? resolved.appearance.theme;
      const fontSize =
        tabConfig?.appearance?.fontSize ?? resolved.appearance.fontSize;
      const showLineNumbers =
        tabConfig?.appearance?.showLineNumbers ??
        resolved.appearance.showLineNumbers;

      const autoSave = tabConfig?.editor?.autoSave ?? resolved.editor.autoSave;
      const formatOnSave =
        tabConfig?.editor?.formatOnSave ?? resolved.editor.formatOnSave;
      const tabSize = tabConfig?.editor?.tabSize ?? resolved.editor.tabSize;

      const favorites = tabConfig?.favorites ?? resolved.favorites;
      const ignorePaths = tabConfig?.ignorePaths ?? resolved.ignorePaths;

      return [
        // --- Section 1: Appearance ---
        {
          label: "Appearance",
          items: [
            // FuzzySelector submenu: pick from a large list
            {
              id: "appearance.theme",
              label: "Theme",
              currentValue: theme,
              description: "Color theme. Opens a searchable list.",
              submenu: (_current, done) => {
                return new FuzzySelector({
                  label: "Select Theme",
                  items: AVAILABLE_THEMES,
                  currentValue: theme,
                  theme: getSettingsListTheme(),
                  onSelect: (selected) => {
                    const current = tabConfig ?? ({} as ExampleConfig);
                    const updated: ExampleConfig = {
                      ...current,
                      appearance: {
                        ...current.appearance,
                        theme: selected,
                      },
                    };
                    ctx.setDraft(updated);
                    done(selected);
                  },
                  onDone: () => done(undefined),
                });
              },
            },
            // Numeric enum: cycle through string representations
            {
              id: "appearance.fontSize",
              label: "Font size",
              currentValue: String(fontSize),
              values: ["12", "14", "16", "18", "20"],
              description: "Editor font size in pixels.",
            },
            // Boolean toggle: on/off
            {
              id: "appearance.showLineNumbers",
              label: "Line numbers",
              currentValue: showLineNumbers ? "on" : "off",
              values: ["on", "off"],
              description: "Show line numbers in the gutter.",
            },
          ],
        },

        // --- Section 2: Editor ---
        {
          label: "Editor",
          items: [
            {
              id: "editor.autoSave",
              label: "Auto save",
              currentValue: autoSave ? "on" : "off",
              values: ["on", "off"],
              description: "Automatically save files after changes.",
            },
            {
              id: "editor.formatOnSave",
              label: "Format on save",
              currentValue: formatOnSave ? "on" : "off",
              values: ["on", "off"],
              description: "Run formatter when saving a file.",
            },
            {
              id: "editor.tabSize",
              label: "Tab size",
              currentValue: String(tabSize),
              values: ["2", "4", "8"],
              description: "Number of spaces per tab.",
            },
          ],
        },

        // --- Section 3: Arrays ---
        {
          label: "Collections",
          items: [
            // ArrayEditor submenu: edit a string array
            {
              id: "favorites",
              label: "Favorites",
              currentValue:
                favorites.length === 0
                  ? "none"
                  : `${favorites.length} item${favorites.length === 1 ? "" : "s"}`,
              description:
                "A list of favorite items. Opens an array editor (add/edit/delete).",
              submenu: (_current, done) => {
                const current = tabConfig ?? ({} as ExampleConfig);
                const currentArray = current.favorites ?? resolved.favorites;

                return new ArrayEditor({
                  label: "Favorites",
                  items: [...currentArray],
                  theme: getSettingsListTheme(),
                  onSave: (items) => {
                    const updated: ExampleConfig = {
                      ...current,
                      favorites: items,
                    };
                    ctx.setDraft(updated);
                    done(
                      items.length === 0
                        ? "none"
                        : `${items.length} item${items.length === 1 ? "" : "s"}`,
                    );
                  },
                  onDone: () => done(undefined),
                });
              },
            },
            // PathArrayEditor submenu: edit filesystem paths with tab completion
            {
              id: "ignorePaths",
              label: "Ignore paths",
              currentValue:
                ignorePaths.length === 0
                  ? "none"
                  : `${ignorePaths.length} path${ignorePaths.length === 1 ? "" : "s"}`,
              description:
                "Paths to ignore. Opens a path editor with Tab completion and validation.",
              submenu: (_current, done) => {
                const current = tabConfig ?? ({} as ExampleConfig);
                const currentArray =
                  current.ignorePaths ?? resolved.ignorePaths;

                return new PathArrayEditor({
                  label: "Ignored Paths",
                  items: [...currentArray],
                  theme: getSettingsListTheme(),
                  validatePath: (value) => {
                    if (value.includes("..")) {
                      return "Relative parent paths not allowed";
                    }
                    return null;
                  },
                  onSave: (items) => {
                    const updated: ExampleConfig = {
                      ...current,
                      ignorePaths: items,
                    };
                    ctx.setDraft(updated);
                    done(
                      items.length === 0
                        ? "none"
                        : `${items.length} path${items.length === 1 ? "" : "s"}`,
                    );
                  },
                  onDone: () => done(undefined),
                });
              },
            },
          ],
        },
      ];
    },

    // --- Custom change handler ---
    // Needed because fontSize and tabSize are numbers, not strings.
    // The default handler would store "14" as a string.
    onSettingChange: (id, newValue, config) => {
      const updated = structuredClone(config);

      switch (id) {
        case "appearance.fontSize": {
          updated.appearance = {
            ...updated.appearance,
            fontSize: Number.parseInt(newValue, 10),
          };
          return updated;
        }
        case "editor.tabSize": {
          updated.editor = {
            ...updated.editor,
            tabSize: Number.parseInt(newValue, 10),
          };
          return updated;
        }
        default:
          // Fall through to default handling for booleans/enums.
          return null;
      }
    },

    // --- Post-save callback ---
    onSave: (_ctx) => {
      // Reload any cached state here.
      // e.g. re-read configLoader.getConfig() into runtime variables.
    },
  });
}
