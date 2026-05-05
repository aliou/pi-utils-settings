/**
 * @aliou/pi-utils-settings
 *
 * Shared settings infrastructure for pi extensions:
 * - ConfigLoader: load/save/merge JSON configs from global + project paths
 * - registerSettingsCommand: create a settings command with Local/Global tabs
 * - Wizard: multi-step wizard component with tabbed navigation and borders
 * - SectionedSettings: sectioned settings list component
 * - SettingsDetailEditor: focused second-level settings editor
 * - ArrayEditor: string array editor submenu component
 * - Helpers: nested value access
 * - getSettingsTheme: combined settings-list + full Theme helper
 */

// Backward-compatible aliases
export type {
  CheckboxListOptions as FuzzyMultiSelectorOptions,
  CheckItem as FuzzyMultiSelectorItem,
  CheckSubOption as FuzzyMultiSelectorSubOption,
  FuzzyPickerOptions as FuzzySelectorOptions,
} from "@aliou/pi-utils-ui";
// Re-export UI components from pi-utils-ui
export {
  ArrayEditor,
  type ArrayEditorOptions,
  CheckboxList,
  CheckboxList as FuzzyMultiSelector,
  type CheckboxListOptions,
  type CheckItem,
  type CheckSubOption,
  FuzzyPicker,
  FuzzyPicker as FuzzySelector,
  type FuzzyPickerOptions,
  getPickerTheme,
  PathArrayEditor,
  type PathArrayEditorOptions,
  type PickerTheme,
  Wizard,
  type WizardOptions,
  type WizardStep,
  type WizardStepContext,
} from "@aliou/pi-utils-ui";

// Local components (settings-domain)
export {
  SectionedSettings,
  type SectionedSettingsOptions,
  type SettingsSection,
} from "./components/sectioned-settings";
export {
  type SettingsDetailActionField,
  type SettingsDetailBooleanField,
  SettingsDetailEditor,
  type SettingsDetailEditorOptions,
  type SettingsDetailEnumField,
  type SettingsDetailField,
  type SettingsDetailSubmenuField,
  type SettingsDetailTextField,
} from "./components/settings-detail-editor";
export {
  ConfigLoader,
  type ConfigStore,
  type Migration,
  type Scope,
} from "./config-loader";
export { getNestedValue, setNestedValue } from "./helpers";
export { buildSchemaUrl } from "./schema";
export {
  type ExtraSettingsTab,
  type ExtraSettingsTabContext,
  registerSettingsCommand,
  type SettingsCommandOptions,
} from "./settings-command";
export { getSettingsTheme, type SettingsTheme } from "./theme";
