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

import { SettingsDetailEditor } from "./components/settings-detail-editor";
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
const DOWN = "\u001b[B";
const CTRL_S = "\u0013";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

interface PanelComponent {
  render: (width: number) => string[];
  handleInput?: (data: string) => void;
  invalidate?: () => void;
}

function makeSettingsHarness(
  overrides: Partial<SettingsCommandOptions<TestConfig, TestConfig>> = {},
) {
  let handler: ((args: unknown, ctx: unknown) => Promise<void>) | undefined;
  let component: PanelComponent | undefined;
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
          {
            fg: (_color: string, text: string) => text,
            bg: (_color: string, text: string) => text,
            bold: (text: string) => text,
          },
          undefined,
          done,
        ) as PanelComponent;
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

  it("saves with Ctrl+S while a submenu is open", async () => {
    let submenuInput: ((data: string) => void) | undefined;

    const harness = makeSettingsHarness({
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
            {
              id: "sub",
              label: "Sub",
              currentValue: "edit",
              submenu: (_value, done) => {
                return {
                  render: () => ["submenu"],
                  handleInput: (data: string) => {
                    submenuInput = undefined;
                    if (data === ESC) done();
                  },
                  invalidate: () => {},
                };
              },
            },
          ],
        },
      ],
    });
    const component = await harness.open();

    // Make a draft change, then open the submenu.
    component.handleInput?.(ENTER);
    component.handleInput?.("j");
    component.handleInput?.(ENTER);
    expect(submenuInput).toBeUndefined(); // sanity: submenu is open, input captured

    // Ctrl+S from inside the submenu saves the draft.
    component.handleInput?.(CTRL_S);
    await Promise.resolve();

    expect(harness.configStore.save).toHaveBeenCalledWith("global", {
      feature: "on",
    });
  });
});

describe("unified shortcut line", () => {
  const LIST_SHORTCUTS = "↑/↓ or j/k navigate · Enter edit/open · Esc back";

  function makeDetailEditorHarness() {
    let capturedHideHint: boolean | undefined;
    const harness = makeSettingsHarness({
      buildSections: (_tabConfig, _resolved, ctx) => [
        {
          label: "General",
          items: [
            {
              id: "feature",
              label: "Feature",
              currentValue: "off",
              values: ["off", "on"],
            },
            {
              id: "detail",
              label: "Detail",
              currentValue: "edit",
              submenu: (_value, done, subCtx) => {
                capturedHideHint = subCtx.hideHint;
                return new SettingsDetailEditor({
                  title: "Editor details",
                  theme: ctx.theme,
                  fields: [
                    {
                      id: "name",
                      type: "text",
                      label: "Name",
                      getValue: () => "dark",
                      setValue: () => {},
                    },
                  ],
                  onDone: (summary) => done(summary),
                  hideHint: subCtx.hideHint,
                });
              },
            },
          ],
        },
      ],
    });
    return { harness, getHideHint: () => capturedHideHint };
  }

  it("shows the default controls line when no submenu is open", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    const output = component.render(80).join("\n");
    expect(output).toContain("Enter/Space change · Ctrl+S save · Esc close");
    expect(output).not.toContain("Esc back");
  });

  it("shows exactly one shortcut line — the submenu's — while a submenu is open", async () => {
    const { harness, getHideHint } = makeDetailEditorHarness();
    const component = await harness.open();

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER);

    // registerSettingsCommand hides its own hint, which the submenu factory
    // context forwards so the editor can suppress its own footer.
    expect(getHideHint()).toBe(true);

    const output = component.render(80).join("\n");
    // The submenu's shortcuts appear exactly once: in the panel controls
    // line below the separator, not in the editor's own footer.
    expect(countOccurrences(output, LIST_SHORTCUTS)).toBe(1);
    expect(output).not.toContain("Enter/Space change");
    expect(output).not.toContain("Esc close");
  });

  it("shows the editing variant while a text field editor is open", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER); // open the detail editor
    component.handleInput?.(ENTER); // open the text field editor

    const output = component.render(80).join("\n");
    expect(countOccurrences(output, "Enter: confirm · Esc: cancel")).toBe(1);
    expect(output).not.toContain("Enter edit/open");
    expect(output).not.toContain("Esc close");
  });

  it("Esc backs out of the submenu instead of closing the panel", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER); // open the detail editor
    component.handleInput?.(ENTER); // open the text field editor

    component.handleInput?.(ESC); // cancel editing, back to editor list
    expect(harness.done).not.toHaveBeenCalled();
    expect(component.render(80).join("\n")).toContain(LIST_SHORTCUTS);

    component.handleInput?.(ESC); // back out of the submenu
    expect(harness.done).not.toHaveBeenCalled();
    expect(component.render(80).join("\n")).toContain("Esc close");

    component.handleInput?.(ESC); // now Esc closes the panel
    expect(harness.done).toHaveBeenCalledWith(undefined);
  });

  it("falls back to the default controls when the submenu exposes no shortcuts", async () => {
    const harness = makeSettingsHarness({
      buildSections: () => [
        {
          label: "General",
          items: [
            {
              id: "sub",
              label: "Sub",
              currentValue: "edit",
              submenu: () => ({
                render: () => ["custom submenu"],
                handleInput: () => {},
                invalidate: () => {},
              }),
            },
          ],
        },
      ],
    });
    const component = await harness.open();

    component.handleInput?.(ENTER);

    const output = component.render(80).join("\n");
    expect(output).toContain("custom submenu");
    expect(output).toContain("Enter/Space change · Ctrl+S save · Esc close");
  });

  it("keeps the panel height identical with and without an open submenu", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    const heightWithoutSubmenu = component.render(80).length;

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER);
    const heightWithSubmenu = component.render(80).length;

    component.handleInput?.(ENTER); // text-editing mode
    const heightWhileEditing = component.render(80).length;

    expect(heightWithSubmenu).toBe(heightWithoutSubmenu);
    expect(heightWhileEditing).toBe(heightWithoutSubmenu);
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
