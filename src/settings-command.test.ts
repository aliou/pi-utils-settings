import { createSettingsListTheme } from "./test/theme";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getSettingsListTheme: () => ({
    label: (value: string) => value,
    value: (value: string) => value,
    description: (value: string) => value,
    cursor: "> ",
    hint: (value: string) => value,
  }),
}));

import { describe, expect, it, vi } from "vitest";
import { ArrayEditor } from "./components/array-editor";
import { SettingsDetailEditor } from "./components/settings-detail-editor";
import { defaultChangeHandler } from "./components/settings-panel";
import { CTRL_S, DOWN, ENTER, ESC, TAB } from "./test/keys";
import { countOccurrences } from "./test/render";
import { makeSettingsHarness, type TestConfig } from "./test/settings-harness";
import type { ExtraSettingsTab } from "./types";

function proxyExtraTab(): ExtraSettingsTab<TestConfig, TestConfig> {
  return {
    id: "proxy",
    label: "Network",
    buildSections: () => [
      {
        label: "Network",
        items: [
          {
            id: "proxy.mode",
            label: "Proxy mode",
            currentValue: "off",
            values: ["off", "on"],
          },
        ],
      },
    ],
  };
}

function expectRegistrationError(
  overrides: Parameters<typeof makeSettingsHarness>[0],
): Error {
  const harness = makeSettingsHarness(overrides);
  expect(harness.registrationError).toBeInstanceOf(Error);
  const error = harness.registrationError as Error;
  expect(error.message).toContain("[settings]");
  expect(harness.registerCommand).not.toHaveBeenCalled();
  return error;
}

describe("registerSettingsCommand", () => {
  it("does not open the UI when the context has no UI", async () => {
    const harness = makeSettingsHarness();
    harness.ctx.hasUI = false;

    const opened = await harness.openCommand("test:settings");

    expect(opened).toBeUndefined();
    expect(harness.notify).not.toHaveBeenCalled();
    expect(harness.done).not.toHaveBeenCalled();
  });

  it("warns when no tabs are configured", async () => {
    const harness = makeSettingsHarness({}, { scopes: [] });

    const opened = await harness.openCommand("test:settings");

    expect(opened).toBeUndefined();
    expect(harness.notify).toHaveBeenCalledWith("No tabs configured", "error");
  });

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

  it("defaults to the first scope with existing config", async () => {
    const harness = makeSettingsHarness(
      {
        buildSections: (_tabConfig, _resolved, scopeCtx) => [
          {
            label: "General",
            items: [
              {
                id: "feature",
                label: `Feature (${scopeCtx.scope})`,
                currentValue: "off",
                values: ["off", "on"],
              },
            ],
          },
        ],
      },
      { scopes: ["global", "local"], withConfig: ["local"] },
    );
    const component = await harness.open();

    expect(component.render(80).join("\n")).toContain("Feature (local)");
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

  it("calls onSave after a successful save", async () => {
    const onSave = vi.fn();
    const harness = makeSettingsHarness({ onSave });
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(CTRL_S);
    await Promise.resolve();

    expect(harness.configStore.save).toHaveBeenCalledWith("global", {
      feature: "on",
    });
    expect(onSave).toHaveBeenCalledWith(harness.ctx);
  });

  it("notifies when saving fails and keeps the draft", async () => {
    const harness = makeSettingsHarness();
    harness.configStore.save.mockRejectedValueOnce(new Error("disk full"));
    const component = await harness.open();

    component.handleInput?.(ENTER);
    component.handleInput?.(CTRL_S);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.notify).toHaveBeenCalledWith(
      "Failed to save Global: Error: disk full",
      "error",
    );
    expect(harness.notify).not.toHaveBeenCalledWith("test: saved", "info");
    // The draft survives: saving again retries.
    harness.configStore.save.mockResolvedValueOnce(undefined);
    component.handleInput?.(CTRL_S);
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.configStore.save).toHaveBeenCalledTimes(2);
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

    component.handleInput?.(ENTER);
    component.handleInput?.("j");
    component.handleInput?.(ENTER);
    expect(submenuInput).toBeUndefined();

    // Ctrl+S from inside the submenu saves the draft.
    component.handleInput?.(CTRL_S);
    await Promise.resolve();

    expect(harness.configStore.save).toHaveBeenCalledWith("global", {
      feature: "on",
    });
  });
});

describe("command aliases and tab args", () => {
  it("registers the main command plus one command per alias", () => {
    const harness = makeSettingsHarness({
      aliases: [
        { commandName: "test:proxy", tabId: "proxy" },
        {
          commandName: "test:advanced",
          tabId: "advanced",
          description: "Open advanced settings",
        },
        { commandName: "test:memory", tabId: "memory" },
      ],
      extraTabs: [
        { id: "proxy", label: "Network", buildSections: () => [] },
        { id: "advanced", label: "Advanced", buildSections: () => [] },
      ],
    });

    expect([...harness.commands.keys()]).toEqual([
      "test:settings",
      "test:proxy",
      "test:advanced",
      "test:memory",
    ]);
    expect(harness.commands.get("test:settings")?.description).toBe(
      "Configure test settings",
    );
    expect(harness.commands.get("test:proxy")?.description).toBe(
      "Open Test Settings (Network)",
    );
    expect(harness.commands.get("test:memory")?.description).toBe(
      "Open Test Settings (Memory)",
    );
    expect(harness.commands.get("test:advanced")?.description).toBe(
      "Open advanced settings",
    );
  });

  it("rejects an alias with an unknown tabId and registers nothing", () => {
    const error = expectRegistrationError({
      aliases: [{ commandName: "test:nope", tabId: "nope" }],
    });
    expect(error.message).toContain('unknown tab "nope"');
  });

  it("rejects duplicate alias commandNames and registers nothing", () => {
    const error = expectRegistrationError({
      aliases: [
        { commandName: "test:proxy", tabId: "proxy" },
        { commandName: "test:proxy", tabId: "advanced" },
      ],
      extraTabs: [
        { id: "proxy", label: "Network", buildSections: () => [] },
        { id: "advanced", label: "Advanced", buildSections: () => [] },
      ],
    });
    expect(error.message).toContain('Duplicate alias commandName "test:proxy"');
  });

  it("rejects an alias equal to the main command name", () => {
    const error = expectRegistrationError({
      aliases: [{ commandName: "test:settings", tabId: "global" }],
    });
    expect(error.message).toContain("collides with the main command name");
  });

  it("opens the UI on the alias's preselected tab and ignores args", async () => {
    const harness = makeSettingsHarness({
      aliases: [{ commandName: "test:proxy", tabId: "proxy" }],
      extraTabs: [proxyExtraTab()],
    });

    const component = await harness.openCommand("test:proxy");
    const output = component!.render(80).join("\n");
    expect(output).toContain("Proxy mode");
    expect(output).not.toContain("Feature");

    const withArgs = await harness.openCommand("test:proxy", "ignored args");
    expect(withArgs!.render(80).join("\n")).toContain("Proxy mode");
  });

  it("opens the UI on the alias's scope tab", async () => {
    const harness = makeSettingsHarness(
      {
        aliases: [{ commandName: "test:memory", tabId: "memory" }],
        buildSections: (tabConfig, _resolved, ctx) => [
          {
            label: "General",
            items: [
              {
                id: "feature",
                label: `Feature (${ctx.scope})`,
                currentValue: tabConfig?.feature ?? "off",
                values: ["off", "on"],
              },
            ],
          },
        ],
      },
      { scopes: ["global", "memory"] },
    );

    const component = await harness.openCommand("test:memory");
    const output = component!.render(80).join("\n");
    expect(output).toContain("Feature (memory)");
    expect(output).not.toContain("Feature (global)");
  });

  it("falls back to the default tab when an alias targets a disabled scope", async () => {
    const harness = makeSettingsHarness({
      aliases: [{ commandName: "test:memory", tabId: "memory" }],
    });

    const component = await harness.openCommand("test:memory");
    expect(component!.render(80).join("\n")).toContain("Feature");
    expect(harness.notify).not.toHaveBeenCalled();
  });

  it("preselects the tab matching the first args token", async () => {
    const harness = makeSettingsHarness({
      extraTabs: [proxyExtraTab()],
    });

    const byId = await harness.open("proxy");
    expect(byId.render(80).join("\n")).toContain("Proxy mode");

    const byIdCase = await harness.open("Proxy");
    expect(byIdCase.render(80).join("\n")).toContain("Proxy mode");

    const byLabel = await harness.open("Network");
    expect(byLabel.render(80).join("\n")).toContain("Proxy mode");
    const byLabelCase = await harness.open("network");
    expect(byLabelCase.render(80).join("\n")).toContain("Proxy mode");

    const firstToken = await harness.open("proxy extra");
    expect(firstToken.render(80).join("\n")).toContain("Proxy mode");
  });

  it("warns on an unknown tab token and opens the default tab", async () => {
    const harness = makeSettingsHarness({
      extraTabs: [proxyExtraTab()],
    });

    const component = await harness.open("bogus");
    expect(harness.notify).toHaveBeenCalledWith(
      "Unknown tab 'bogus'",
      "warning",
    );
    expect(component.render(80).join("\n")).toContain("Feature");
  });

  it("falls back silently for a valid but disabled scope token", async () => {
    const harness = makeSettingsHarness({
      extraTabs: [proxyExtraTab()],
    });

    const component = await harness.open("memory");
    expect(harness.notify).not.toHaveBeenCalled();
    expect(component.render(80).join("\n")).toContain("Feature");
  });

  it("opens the default tab for empty or whitespace args", async () => {
    const harness = makeSettingsHarness({
      extraTabs: [proxyExtraTab()],
    });

    for (const args of ["", "   "]) {
      const component = await harness.open(args);
      expect(component.render(80).join("\n")).toContain("Feature");
      expect(harness.notify).not.toHaveBeenCalled();
    }
  });

  it("registers argument completions on the main command only", () => {
    const harness = makeSettingsHarness({
      aliases: [{ commandName: "test:proxy", tabId: "proxy" }],
      extraTabs: [proxyExtraTab()],
    });

    const main = harness.commands.get("test:settings");
    expect(typeof main?.getArgumentCompletions).toBe("function");

    const proxyItem = {
      value: "proxy",
      label: "Network",
      description: "Open settings on this tab",
    };
    expect(main?.getArgumentCompletions?.("")).toEqual([
      {
        value: "global",
        label: "Global",
        description: "Open settings on this tab",
      },
      proxyItem,
    ]);

    expect(main?.getArgumentCompletions?.("PRO")).toEqual([proxyItem]);
    expect(main?.getArgumentCompletions?.("net")).toEqual([proxyItem]);

    expect(main?.getArgumentCompletions?.("zzz")).toBeNull();

    expect(
      harness.commands.get("test:proxy")?.getArgumentCompletions,
    ).toBeUndefined();
  });
});

describe("unified shortcut line", () => {
  const LIST_SHORTCUTS = "↑/↓ or j/k navigate · Enter edit/open · Esc back";

  function makeDetailEditorHarness() {
    let capturedHideHint: boolean | undefined;
    const harness = makeSettingsHarness({
      buildSections: () => [
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
                  theme: createSettingsListTheme(),
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

    expect(getHideHint()).toBe(true);

    const output = component.render(80).join("\n");
    expect(countOccurrences(output, LIST_SHORTCUTS)).toBe(1);
    expect(output).not.toContain("Enter/Space change");
    expect(output).not.toContain("Esc close");
  });

  it("shows the editing variant while a text field editor is open", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER);
    component.handleInput?.(ENTER);

    const output = component.render(80).join("\n");
    expect(countOccurrences(output, "Enter: confirm · Esc: cancel")).toBe(1);
    expect(output).not.toContain("Enter edit/open");
    expect(output).not.toContain("Esc close");
  });

  it("Esc backs out of the submenu instead of closing the panel", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER);
    component.handleInput?.(ENTER);

    component.handleInput?.(ESC);
    expect(harness.done).not.toHaveBeenCalled();
    expect(component.render(80).join("\n")).toContain(LIST_SHORTCUTS);

    component.handleInput?.(ESC);
    expect(harness.done).not.toHaveBeenCalled();
    expect(component.render(80).join("\n")).toContain("Esc close");

    component.handleInput?.(ESC);
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

  it("hosts an unframed ArrayEditor submenu with a single controls line at fixed height", async () => {
    const harness = makeSettingsHarness({
      buildSections: () => [
        {
          label: "Collections",
          items: [
            {
              id: "tags",
              label: "Tags",
              currentValue: "1 item",
              submenu: (_value, done, subCtx) =>
                new ArrayEditor({
                  label: "Tags",
                  items: ["one"],
                  theme: createSettingsListTheme(),
                  hideHint: subCtx.hideHint,
                  onSave: () => {},
                  onDone: () => done(undefined),
                }),
            },
          ],
        },
      ],
    });
    const component = await harness.open();

    const heightWithoutSubmenu = component.render(80).length;

    component.handleInput?.(ENTER);

    let output = component.render(80).join("\n");
    expect(
      countOccurrences(
        output,
        "a: add · e/Enter: edit · d: delete · Esc: back",
      ),
    ).toBe(1);
    expect(output).not.toContain("Enter/Space change");
    expect(component.render(80).length).toBe(heightWithoutSubmenu);

    component.handleInput?.("a");

    output = component.render(80).join("\n");
    expect(countOccurrences(output, "Enter: confirm · Esc: cancel")).toBe(1);
    expect(output).not.toContain("a: add");
    expect(output).not.toContain("Enter/Space change");
    expect(component.render(80).length).toBe(heightWithoutSubmenu);
  });

  it("keeps the panel height identical with and without an open submenu", async () => {
    const { harness } = makeDetailEditorHarness();
    const component = await harness.open();

    const heightWithoutSubmenu = component.render(80).length;

    component.handleInput?.(DOWN);
    component.handleInput?.(ENTER);
    const heightWithSubmenu = component.render(80).length;

    component.handleInput?.(ENTER);
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
