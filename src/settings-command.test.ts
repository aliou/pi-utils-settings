import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getSettingsListTheme: () => ({
    label: (value: string) => value,
    value: (value: string) => value,
    description: (value: string) => value,
    cursor: "> ",
    hint: (value: string) => value,
  }),
}));

import {
  defaultChangeHandler,
  registerSettingsCommand,
  type SettingsCommandOptions,
} from "./settings-command";

interface TestConfig {
  feature?: string;
  nested?: { value?: string };
}

const ENTER = "\r";
const ESC = "\u001b";
const TAB = "\t";
const CTRL_S = "\u0013";

function makeSettingsHarness(
  overrides: Partial<SettingsCommandOptions<TestConfig, TestConfig>> = {},
) {
  let handler: ((args: unknown, ctx: unknown) => Promise<void>) | undefined;
  let component: { handleInput?: (data: string) => void } | undefined;
  const done = vi.fn();
  const notify = vi.fn();

  const pi = {
    registerCommand: vi.fn(
      (
        _name: string,
        command: { handler: (args: unknown, ctx: unknown) => Promise<void> },
      ) => {
        handler = command.handler;
      },
    ),
  };

  const configStore = {
    getEnabledScopes: () => ["global"],
    hasConfig: () => true,
    getRawConfig: () => ({ feature: "off" }),
    getConfig: () => ({ feature: "off" }),
    save: vi.fn(),
  };

  registerSettingsCommand(pi as never, {
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
  });

  const requestRender = vi.fn();

  const ctx = {
    hasUI: true,
    ui: {
      notify,
      custom: vi.fn((factory: (...args: unknown[]) => unknown) => {
        component = factory(
          { requestRender },
          {},
          undefined,
          done,
        ) as typeof component;
      }),
    },
  };

  return {
    async open() {
      await handler?.([], ctx);
      if (!component) throw new Error("settings component was not created");
      return component;
    },
    done,
    notify,
    requestRender,
    configStore,
  };
}

describe("registerSettingsCommand", () => {
  it("preserves close behavior when no onBeforeClose hook is provided", async () => {
    const harness = makeSettingsHarness();
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(ESC);

    expect(harness.done).toHaveBeenCalledWith(undefined);
  });

  it("keeps the settings UI open when onBeforeClose returns false", async () => {
    const onBeforeClose = vi.fn(() => false);
    const harness = makeSettingsHarness({ onBeforeClose });
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(ESC);

    expect(onBeforeClose).toHaveBeenCalledWith(true);
    expect(harness.done).not.toHaveBeenCalled();
  });

  it("closes the settings UI when onBeforeClose returns true", async () => {
    const onBeforeClose = vi.fn(() => true);
    const harness = makeSettingsHarness({ onBeforeClose });
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(ESC);

    expect(onBeforeClose).toHaveBeenCalledWith(true);
    expect(harness.done).toHaveBeenCalledWith(undefined);
  });

  it("passes false to onBeforeClose when there are no drafts", async () => {
    const onBeforeClose = vi.fn(() => false);
    const harness = makeSettingsHarness({ onBeforeClose });
    const component = await harness.open();

    component.handleInput?.(ESC);

    expect(onBeforeClose).toHaveBeenCalledWith(false);
    expect(harness.done).not.toHaveBeenCalled();
  });

  it("falls back to default handling when onSettingChange returns null", async () => {
    const onSettingChange = vi.fn(() => null);
    const harness = makeSettingsHarness({ onSettingChange });
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(CTRL_S);
    await Promise.resolve();

    expect(onSettingChange).toHaveBeenCalledWith("feature", "on", {
      feature: "off",
    });
    expect(harness.configStore.save).toHaveBeenCalledWith("global", {
      feature: "on",
    });
  });

  it("allows extra tab value cycling to update a scope draft", async () => {
    const harness = makeSettingsHarness({
      extraTabs: [
        {
          id: "advanced",
          label: "Advanced",
          buildSections: ({ getDraftForScope, getRawForScope }) => {
            const config =
              getDraftForScope("global") ?? getRawForScope("global");
            return [
              {
                label: "Advanced",
                items: [
                  {
                    id: "feature",
                    label: "Feature",
                    currentValue: config?.feature ?? "off",
                    values: ["off", "on"],
                  },
                ],
              },
            ];
          },
          onSettingChange: (id, newValue, ctx) => {
            ctx.applySettingChangeToScope("global", id, newValue);
          },
        },
      ],
    });
    const component = await harness.open();

    component.handleInput?.(TAB);
    component.handleInput?.(ENTER);
    component.handleInput?.(CTRL_S);
    await Promise.resolve();

    expect(harness.configStore.save).toHaveBeenCalledWith("global", {
      feature: "on",
    });
  });

  it("passes requestRender to async submenus", async () => {
    let capturedCtx: { requestRender: () => void } | undefined;

    const harness = makeSettingsHarness({
      buildSections: () => [
        {
          label: "Remote",
          items: [
            {
              id: "async",
              label: "Async",
              currentValue: "loading",
              submenu: (_value, _done, ctx) => {
                capturedCtx = ctx;
                return {
                  render: () => ["async"],
                  handleInput: () => {},
                  invalidate: () => {},
                };
              },
            },
          ],
        },
      ],
    });

    const component = await harness.open();

    component.handleInput?.(ENTER);
    expect(capturedCtx).toBeDefined();

    capturedCtx?.requestRender();
    expect(harness.requestRender).toHaveBeenCalled();
  });
});

describe("defaultChangeHandler", () => {
  it("stores raw string values as-is", () => {
    const config: TestConfig = {};
    const result = defaultChangeHandler("feature", "disabled", config);
    expect(result.feature).toBe("disabled");
  });

  it("does not convert on/off to booleans", () => {
    const config: TestConfig = {};
    const resultOn = defaultChangeHandler("feature", "on", config);
    expect(resultOn.feature).toBe("on");

    const resultOff = defaultChangeHandler("feature", "off", config);
    expect(resultOff.feature).toBe("off");
  });

  it("does not convert enabled/disabled to booleans", () => {
    const config: TestConfig = {};
    const resultEnabled = defaultChangeHandler("feature", "enabled", config);
    expect(resultEnabled.feature).toBe("enabled");

    const resultDisabled = defaultChangeHandler("feature", "disabled", config);
    expect(resultDisabled.feature).toBe("disabled");
  });

  it("stores enum strings as-is", () => {
    const config: TestConfig = {};
    const result = defaultChangeHandler("feature", "pnpm", config);
    expect(result.feature).toBe("pnpm");
  });

  it("sets nested values via dotted path", () => {
    const config: TestConfig = {};
    const result = defaultChangeHandler("nested.value", "test", config);
    expect(result.nested).toEqual({ value: "test" });
  });

  it("does not mutate the original config", () => {
    const config: TestConfig = { feature: "original" };
    const result = defaultChangeHandler("feature", "changed", config);
    expect(config.feature).toBe("original");
    expect(result.feature).toBe("changed");
  });
});
