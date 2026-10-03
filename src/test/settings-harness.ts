import { vi } from "vitest";
import {
  registerSettingsCommand,
  type SettingsCommandOptions,
} from "../settings-command";
import type { Scope } from "../types";

export interface TestConfig {
  feature?: string;
  nested?: { value?: string };
}

export interface PanelComponent {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  invalidate?: () => void;
}

export interface RegisteredCommand {
  description?: string;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

export interface SettingsHarnessSettings {
  scopes?: Scope[];
  withConfig?: Scope[];
}

/**
 * Register registerSettingsCommand against a fake pi, capturing every
 * registered command and the panel component created on open.
 *
 * Registration errors are swallowed into `registrationError` so tests can
 * assert that invalid options register nothing.
 */
export function makeSettingsHarness(
  overrides: Partial<SettingsCommandOptions<TestConfig, TestConfig>> = {},
  settings: SettingsHarnessSettings = {},
) {
  const commands = new Map<string, RegisteredCommand>();
  let component: PanelComponent | undefined;
  const done = vi.fn();
  const notify = vi.fn();
  const requestRender = vi.fn();

  const pi = {
    registerCommand: vi.fn((name: string, command: RegisteredCommand) => {
      commands.set(name, command);
    }),
  };

  const enabledScopes = settings.scopes ?? ["global"];
  const withConfig = new Set(settings.withConfig ?? ["global"]);
  const configStore = {
    getEnabledScopes: () => [...enabledScopes],
    hasConfig: (scope: Scope) => withConfig.has(scope),
    getRawConfig: () => ({ feature: "off" }),
    getConfig: () => ({ feature: "off" }),
    save: vi.fn(),
  };

  const options: SettingsCommandOptions<TestConfig, TestConfig> = {
    commandName: "test:settings",
    title: "Test Settings",
    configStore: configStore as never,
    buildSections: (tabConfig) => [
      {
        label: "General",
        items: [
          {
            id: "feature",
            label: "Feature",
            currentValue: tabConfig?.feature ?? "off",
            values: ["off", "on"],
          },
        ],
      },
    ],
    ...overrides,
  };

  const theme = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
  const ctx = {
    hasUI: true,
    ui: {
      notify,
      custom: vi.fn((factory: (...args: unknown[]) => unknown) => {
        component = factory(
          { requestRender },
          theme,
          undefined,
          done,
        ) as PanelComponent;
      }),
    },
  };

  const invoke = async (
    name: string,
    args = "",
  ): Promise<PanelComponent | undefined> => {
    const command = commands.get(name);
    if (!command) {
      throw new Error(`command "${name}" is not registered`);
    }
    await command.handler(args, ctx);
    return component;
  };

  let registrationError: unknown;
  try {
    registerSettingsCommand(pi as never, options);
  } catch (error) {
    registrationError = error;
  }

  return {
    options,
    commands,
    registerCommand: pi.registerCommand,
    configStore,
    done,
    notify,
    requestRender,
    ctx,
    registrationError,
    async open(args = "") {
      const opened = await invoke(options.commandName, args);
      if (!opened) throw new Error("settings component was not created");
      return opened;
    },
    openCommand(name: string, args = "") {
      return invoke(name, args);
    },
  };
}
