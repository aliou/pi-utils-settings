import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  type SectionedSettingItem,
  SectionedSettings,
  type SettingsSection,
  type SettingsSubmenuComponent,
  type SettingsSubmenuContext,
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

  describe("submenu shortcuts", () => {
    function makeSettingsWithSubmenu(
      submenuComponent: SettingsSubmenuComponent,
      options: { hideHint?: boolean } = {},
      onCtx?: (ctx: SettingsSubmenuContext) => void,
    ): SectionedSettings {
      return new SectionedSettings(
        [
          makeSection([
            {
              id: "detail",
              label: "Detail",
              currentValue: "edit",
              submenu: (_value, _done, ctx) => {
                onCtx?.(ctx);
                return submenuComponent;
              },
            },
          ]),
        ],
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
        options,
      );
    }

    it("returns undefined when no submenu is open", () => {
      const settings = makeSettingsWithSubmenu({
        render: () => ["submenu"],
        handleInput: () => {},
        invalidate: () => {},
        getShortcuts: () => "Esc back",
      });

      expect(settings.getActiveSubmenuShortcuts()).toBeUndefined();
    });

    it("exposes the active submenu's shortcuts", () => {
      const settings = makeSettingsWithSubmenu({
        render: () => ["submenu"],
        handleInput: () => {},
        invalidate: () => {},
        getShortcuts: () => "↑/↓ navigate · Enter edit/open · Esc back",
      });

      settings.handleInput(ENTER);

      expect(settings.hasActiveSubmenu()).toBe(true);
      expect(settings.getActiveSubmenuShortcuts()).toBe(
        "↑/↓ navigate · Enter edit/open · Esc back",
      );
    });

    it("returns undefined when the submenu does not implement getShortcuts", () => {
      const settings = makeSettingsWithSubmenu({
        render: () => ["submenu"],
        handleInput: () => {},
        invalidate: () => {},
      });

      settings.handleInput(ENTER);

      expect(settings.hasActiveSubmenu()).toBe(true);
      expect(settings.getActiveSubmenuShortcuts()).toBeUndefined();
    });

    it("forwards its hideHint option to submenu factories", () => {
      let capturedCtx: SettingsSubmenuContext | undefined;
      const settings = makeSettingsWithSubmenu(
        {
          render: () => ["submenu"],
          handleInput: () => {},
          invalidate: () => {},
        },
        { hideHint: true },
        (ctx) => {
          capturedCtx = ctx;
        },
      );

      settings.handleInput(ENTER);

      expect(capturedCtx?.hideHint).toBe(true);
    });

    it("defaults hideHint to false for standalone use", () => {
      let capturedCtx: SettingsSubmenuContext | undefined;
      const settings = makeSettingsWithSubmenu(
        {
          render: () => ["submenu"],
          handleInput: () => {},
          invalidate: () => {},
        },
        {},
        (ctx) => {
          capturedCtx = ctx;
        },
      );

      settings.handleInput(ENTER);

      expect(capturedCtx?.hideHint).toBe(false);
    });
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

  describe("contentHeight", () => {
    const DOWN = "\u001b[B";
    const LONG_DESCRIPTION =
      "This description is intentionally very long so that it wraps onto " +
      "several lines at narrow widths and its tail end is clipped.";

    const oneItem = () => [
      makeSection([{ id: "feature", label: "Feature", currentValue: "off" }]),
    ];

    const manyItemsWithDescription = () => [
      makeSection(
        Array.from({ length: 20 }, (_, i) => ({
          id: `item-${i}`,
          label: `Item ${i}`,
          currentValue: "x",
          description: i === 0 ? LONG_DESCRIPTION : undefined,
        })),
      ),
    ];

    it("pads short content to exactly contentHeight lines", () => {
      const settings = new SectionedSettings(
        oneItem(),
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { contentHeight: 12 },
      );

      const lines = settings.render(80);
      expect(lines).toHaveLength(12);
      // Content (section header + item) is intact at the top.
      expect(lines.slice(0, 2).join("\n")).toContain("Feature");
      // Padding sits between the list and the hint line.
      expect(lines.slice(2, 11).every((line) => line === "")).toBe(true);
      expect(lines[11]).toContain("Esc to close");
    });

    it("shrinks the list window when content is taller than contentHeight", () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: `item-${i}`,
        label: `Item ${i}`,
        currentValue: "x",
      }));

      const settings = new SectionedSettings(
        [makeSection(items)],
        25,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { contentHeight: 5 },
      );

      const lines = settings.render(80);
      // The list window and scroll indicator fit the 5-line budget: 2 item
      // lines + indicator + blank + hint.
      expect(lines).toHaveLength(5);
      expect(lines.join("\n")).toContain("(1/20)");
      expect(lines.join("\n")).not.toContain("Item 19");
      expect(lines[4]).toContain("Esc to close");
    });

    it("wraps a long description in full and shrinks the list window", () => {
      const settings = new SectionedSettings(
        manyItemsWithDescription(),
        15,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { enableSearch: true, contentHeight: 20 },
      );

      const lines = settings.render(40);
      expect(lines).toHaveLength(20);
      // The description is fully wrapped, never truncated.
      const rendered = lines.join("\n");
      expect(rendered).toContain("clipped.");
      expect(rendered).not.toContain("...");
      // The list window shrank below maxVisible (15) to make room: the
      // wrapped description takes 5 lines, so fewer items are visible.
      const itemLines = lines.filter((line) => /Item \d+/.test(line));
      expect(itemLines.length).toBeLessThan(15);
      expect(rendered).toContain("(1/20)");
      expect(lines[19]).toContain("Esc to close");
    });

    it("bottom-anchors the description just above the hint line", () => {
      const settings = new SectionedSettings(
        [
          makeSection([
            {
              id: "alpha",
              label: "Alpha",
              currentValue: "a",
              description: "A short description.",
            },
            { id: "bravo", label: "Bravo", currentValue: "b" },
          ]),
        ],
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { contentHeight: 12 },
      );

      const lines = settings.render(80);
      expect(lines).toHaveLength(12);
      const descIndex = lines.findIndex((line) =>
        line.includes("A short description."),
      );
      // The description's last line sits immediately above the hint block.
      expect(descIndex).toBe(9);
      expect(lines[10]).toBe("");
      expect(lines[11]).toContain("Esc to close");
      // The space between the list and the description is blank padding.
      expect(lines.slice(3, 9).every((line) => line === "")).toBe(true);
    });

    it("renders an exact-fit description without cutting it", () => {
      // At width 40 the long description wraps to 4 lines; the exact-fit
      // budget is 2 list lines + 5 description lines + 2 hint lines.
      const settings = new SectionedSettings(
        [
          makeSection([
            {
              id: "feature",
              label: "Feature",
              currentValue: "off",
              description: LONG_DESCRIPTION,
            },
          ]),
        ],
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { contentHeight: 9 },
      );

      const lines = settings.render(40);
      expect(lines).toHaveLength(9);
      expect(lines.join("\n")).toContain("clipped.");
      expect(lines.join("\n")).not.toContain("...");
      expect(lines[8]).toContain("Esc to close");
    });

    it("keeps the total height when the selected item has no description", () => {
      const settings = new SectionedSettings(
        manyItemsWithDescription(),
        15,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { enableSearch: true, contentHeight: 20 },
      );

      expect(settings.render(40)).toHaveLength(20);

      // Move to an item without a description: the padding absorbs the
      // space and the total stays at 20.
      settings.handleInput(DOWN);
      const lines = settings.render(40);
      expect(lines).toHaveLength(20);
      expect(lines[19]).toContain("Esc to close");
    });

    it("renders identically when the option is unset", () => {
      const withoutOption = new SectionedSettings(
        oneItem(),
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
      );
      const withZero = new SectionedSettings(
        oneItem(),
        10,
        createTheme(),
        vi.fn(),
        vi.fn(),
        { contentHeight: 0 },
      );

      const baseline = withoutOption.render(80);
      expect(withZero.render(80)).toEqual(baseline);
      // No padding is added: header + item + blank + hint.
      expect(baseline).toHaveLength(4);
    });
  });
});
