import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  type SectionedSettingItem,
  SectionedSettings,
  type SettingsSection,
} from "./sectioned-settings";

const ENTER = "\r";

function createTheme(): SettingsListTheme {
  return {
    cursor: "> ",
    label: (text: string) => text,
    value: (text: string) => text,
    description: (text: string) => text,
    hint: (text: string) => text,
  } as unknown as SettingsListTheme;
}

function makeSection(items: SectionedSettingItem[]): SettingsSection {
  return { label: "Test", items };
}

describe("SectionedSettings", () => {
  it("renders sectioned items", () => {
    const settings = new SectionedSettings(
      [
        makeSection([
          {
            id: "feature",
            label: "Feature",
            currentValue: "off",
            values: ["off", "on"],
          },
        ]),
      ],
      10,
      createTheme(),
      vi.fn(),
      vi.fn(),
    );

    const rendered = settings.render(80).join("\n");
    expect(rendered).toContain("Feature");
    expect(rendered).toContain("off");
  });

  it("cycles through values on Enter/Space", () => {
    const onChange = vi.fn();
    const settings = new SectionedSettings(
      [
        makeSection([
          {
            id: "feature",
            label: "Feature",
            currentValue: "off",
            values: ["off", "on"],
          },
        ]),
      ],
      10,
      createTheme(),
      onChange,
      vi.fn(),
    );

    settings.handleInput(ENTER);

    expect(onChange).toHaveBeenCalledWith("feature", "on");
    expect(settings.render(80).join("\n")).toContain("on");
  });

  it("passes requestRender context to submenu factories and calls it", () => {
    const requestRender = vi.fn();
    const onChange = vi.fn();
    const onDone = vi.fn();
    let capturedCtx: { requestRender: () => void } | undefined;

    const submenuComponent: Component = {
      render: () => ["submenu"],
      handleInput: () => {},
      invalidate: () => {},
    };

    const settings = new SectionedSettings(
      [
        makeSection([
          {
            id: "async",
            label: "Async",
            currentValue: "loading",
            submenu: (_value, done, ctx) => {
              capturedCtx = ctx;
              onDone.mockImplementation(done);
              return submenuComponent;
            },
          },
        ]),
      ],
      10,
      createTheme(),
      onChange,
      vi.fn(),
      { requestRender },
    );

    settings.handleInput(ENTER);
    expect(settings.hasActiveSubmenu()).toBe(true);
    expect(capturedCtx).toBeDefined();

    capturedCtx?.requestRender();
    expect(requestRender).toHaveBeenCalled();

    // Closing with a value propagates through onChange.
    onDone?.("updated");
    expect(onChange).toHaveBeenCalledWith("async", "updated");
    expect(settings.hasActiveSubmenu()).toBe(false);
  });

  it("closes submenu without onChange when done receives undefined", () => {
    const onChange = vi.fn();
    let capturedDone: ((selectedValue?: string) => void) | undefined;

    const submenuComponent: Component = {
      render: () => ["submenu"],
      handleInput: () => {},
      invalidate: () => {},
    };

    const settings = new SectionedSettings(
      [
        makeSection([
          {
            id: "cancelable",
            label: "Cancelable",
            currentValue: "ok",
            submenu: (_value, done) => {
              capturedDone = done;
              return submenuComponent;
            },
          },
        ]),
      ],
      10,
      createTheme(),
      onChange,
      vi.fn(),
    );

    settings.handleInput(ENTER);
    expect(settings.hasActiveSubmenu()).toBe(true);

    capturedDone?.(undefined);

    expect(onChange).not.toHaveBeenCalled();
    expect(settings.hasActiveSubmenu()).toBe(false);
  });

  it("filters items with search input", () => {
    const settings = new SectionedSettings(
      [
        makeSection([
          { id: "alpha", label: "Alpha", currentValue: "a" },
          { id: "beta", label: "Beta", currentValue: "b" },
        ]),
      ],
      10,
      createTheme(),
      vi.fn(),
      vi.fn(),
      { enableSearch: true },
    );

    // Type "bet" to filter down to Beta.
    for (const ch of "bet") {
      settings.handleInput(ch);
    }

    const rendered = settings.render(80).join("\n");
    expect(rendered).toContain("Beta");
    expect(rendered).not.toContain("Alpha");
  });
});
