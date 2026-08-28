import type { Component, SettingsListTheme } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsDetailEditor,
  type SettingsDetailField,
} from "./settings-detail-editor";

const ENTER = "\r";
const ESC = "\u001b";

function createTheme(): SettingsListTheme {
  return {
    cursor: "> ",
    label: (text: string) => text,
    value: (text: string) => text,
    hint: (text: string) => text,
    description: (text: string) => text,
  } as unknown as SettingsListTheme;
}

describe("SettingsDetailEditor", () => {
  it("navigates with j/k and returns summary on Esc", () => {
    const doneCalls: Array<string | undefined> = [];

    const fields: SettingsDetailField[] = [
      {
        id: "first",
        type: "boolean",
        label: "First",
        getValue: () => false,
        setValue: () => {},
      },
      {
        id: "second",
        type: "boolean",
        label: "Second",
        getValue: () => true,
        setValue: () => {},
      },
    ];

    const editor = new SettingsDetailEditor({
      title: "Details",
      fields,
      theme: createTheme(),
      onDone: (summary) => doneCalls.push(summary),
      getDoneSummary: () => "2 fields",
    });

    editor.handleInput("k");

    const rendered = editor.render(80).join("\n");
    expect(rendered).toContain("> Second");
    expect(rendered).toContain("on");

    editor.handleInput(ESC);
    expect(doneCalls).toEqual(["2 fields"]);
  });

  it("commits text and enum field callbacks", () => {
    let themeName = "";
    let tabSize = "2";

    const fields: SettingsDetailField[] = [
      {
        id: "theme",
        type: "text",
        label: "Theme",
        getValue: () => themeName,
        setValue: (value) => {
          themeName = value;
        },
      },
      {
        id: "tabSize",
        type: "enum",
        label: "Tab size",
        getValue: () => tabSize,
        setValue: (value) => {
          tabSize = value;
        },
        options: ["2", "4", "8"],
      },
    ];

    const editor = new SettingsDetailEditor({
      title: "Details",
      fields,
      theme: createTheme(),
      onDone: () => {},
    });

    editor.handleInput(ENTER);
    for (const ch of "light") {
      editor.handleInput(ch);
    }
    editor.handleInput(ENTER);

    editor.handleInput("j");
    editor.handleInput(ENTER);
    editor.handleInput("j");
    editor.handleInput(ENTER);

    expect(themeName).toBe("light");
    expect(tabSize).toBe("4");
  });

  it("toggles boolean and confirms destructive action", () => {
    let enabled = false;
    let cleared = false;

    const fields: SettingsDetailField[] = [
      {
        id: "enabled",
        type: "boolean",
        label: "Enabled",
        getValue: () => enabled,
        setValue: (value) => {
          enabled = value;
        },
      },
      {
        id: "clear",
        type: "action",
        label: "Clear",
        onConfirm: () => {
          cleared = true;
        },
      },
    ];

    const editor = new SettingsDetailEditor({
      title: "Details",
      fields,
      theme: createTheme(),
      onDone: () => {},
    });

    editor.handleInput(ENTER);
    editor.handleInput("j");
    editor.handleInput(ENTER);
    editor.handleInput("y");

    expect(enabled).toBe(true);
    expect(cleared).toBe(true);
  });

  it("opens nested submenu and returns cleanly", () => {
    let summaryFromNested: string | undefined;

    const nested: Component = {
      render: () => ["nested"],
      handleInput: () => {},
      invalidate: () => {},
    };

    const fields: SettingsDetailField[] = [
      {
        id: "nested",
        type: "submenu",
        label: "Nested",
        getValue: () => "open",
        submenu: (done) => ({
          ...nested,
          handleInput: (data: string) => {
            if (data === "x") {
              done("updated");
            }
          },
        }),
        onSubmenuDone: (summary) => {
          summaryFromNested = summary;
        },
      },
    ];

    const editor = new SettingsDetailEditor({
      title: "Details",
      fields,
      theme: createTheme(),
      onDone: () => {},
    });

    editor.handleInput(ENTER);
    expect(editor.render(80).join("\n")).toContain("nested");

    editor.handleInput("x");

    const rendered = editor.render(80).join("\n");
    expect(rendered).toContain("> Nested");
    expect(rendered).toContain("› open");
    expect(summaryFromNested).toBe("updated");
  });

  it("passes requestRender context to nested submenus", () => {
    const requestRender = vi.fn();
    let capturedCtx: { requestRender: () => void } | undefined;

    const fields: SettingsDetailField[] = [
      {
        id: "async",
        type: "submenu",
        label: "Async",
        getValue: () => "loading",
        submenu: (done, ctx) => {
          capturedCtx = ctx;
          return {
            render: () => ["async"],
            handleInput: (data: string) => {
              if (data === "x") {
                done("ready");
              }
            },
            invalidate: () => {},
          };
        },
        onSubmenuDone: () => {},
      },
    ];

    const editor = new SettingsDetailEditor({
      title: "Details",
      fields,
      theme: createTheme(),
      onDone: () => {},
      requestRender,
    });

    editor.handleInput(ENTER);
    expect(editor.render(80).join("\n")).toContain("async");
    expect(capturedCtx).toBeDefined();

    capturedCtx?.requestRender();
    expect(requestRender).toHaveBeenCalled();

    editor.handleInput("x");
    expect(requestRender).toHaveBeenCalledTimes(2);
  });

  describe("getShortcuts", () => {
    function makeEditor(
      fields: SettingsDetailField[],
      options: { hintSuffix?: string; hideHint?: boolean } = {},
    ): SettingsDetailEditor {
      return new SettingsDetailEditor({
        title: "Details",
        fields,
        theme: createTheme(),
        onDone: () => {},
        ...options,
      });
    }

    const textField = (): SettingsDetailField => ({
      id: "theme",
      type: "text",
      label: "Theme",
      getValue: () => "dark",
      setValue: () => {},
    });

    it("returns list-mode shortcuts, including hintSuffix when set", () => {
      expect(makeEditor([textField()]).getShortcuts()).toBe(
        "↑/↓ or j/k navigate · Enter edit/open · Esc back",
      );
      expect(
        makeEditor([textField()], { hintSuffix: "Ctrl+S save" }).getShortcuts(),
      ).toBe("↑/↓ or j/k navigate · Enter edit/open · Esc back · Ctrl+S save");
    });

    it("returns the editing variant while a text field editor is open", () => {
      const editor = makeEditor([textField()]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBe("Enter: confirm · Esc: cancel");

      // Esc cancels editing back to list mode.
      editor.handleInput(ESC);
      expect(editor.getShortcuts()).toBe(
        "↑/↓ or j/k navigate · Enter edit/open · Esc back",
      );
    });

    it("returns choice-picker shortcuts in enum mode", () => {
      const editor = makeEditor([
        {
          id: "tabSize",
          type: "enum",
          label: "Tab size",
          getValue: () => "2",
          setValue: () => {},
          options: ["2", "4", "8"],
        },
      ]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBe(
        "↑/↓ or j/k navigate · Enter: choose · Esc: cancel",
      );
    });

    it("returns Esc: back in enum mode when there are no choices", () => {
      const editor = makeEditor([
        {
          id: "tabSize",
          type: "enum",
          label: "Tab size",
          getValue: () => "2",
          setValue: () => {},
          options: [],
        },
      ]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBe("Esc: back");
    });

    it("returns confirm shortcuts, honoring a custom confirmHint", () => {
      const editor = makeEditor([
        {
          id: "clear",
          type: "action",
          label: "Clear",
          onConfirm: () => {},
          confirmHint: "  Enter: wipe it · Esc: keep",
        },
      ]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBe("Enter: wipe it · Esc: keep");
    });

    it("returns Esc: back for the empty state", () => {
      expect(makeEditor([]).getShortcuts()).toBe("Esc: back");
    });

    it("delegates to a nested submenu that exposes shortcuts", () => {
      const editor = makeEditor([
        {
          id: "nested",
          type: "submenu",
          label: "Nested",
          getValue: () => "open",
          submenu: () => ({
            render: () => ["nested"],
            handleInput: () => {},
            invalidate: () => {},
            getShortcuts: () => "Type to filter · Enter select · Esc back",
          }),
        },
      ]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBe(
        "Type to filter · Enter select · Esc back",
      );
    });

    it("returns undefined for a nested submenu without getShortcuts", () => {
      const editor = makeEditor([
        {
          id: "nested",
          type: "submenu",
          label: "Nested",
          getValue: () => "open",
          submenu: () => ({
            render: () => ["nested"],
            handleInput: () => {},
            invalidate: () => {},
          }),
        },
      ]);

      editor.handleInput(ENTER);

      expect(editor.getShortcuts()).toBeUndefined();
    });
  });

  describe("hideHint", () => {
    const textField = (): SettingsDetailField => ({
      id: "theme",
      type: "text",
      label: "Theme",
      description: "A short description.",
      getValue: () => "dark",
      setValue: () => {},
    });

    it("omits the footer hint lines in list and text modes", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [textField()],
        theme: createTheme(),
        onDone: () => {},
        hideHint: true,
      });

      expect(editor.render(80).join("\n")).not.toContain("Esc back");

      editor.handleInput(ENTER);
      expect(editor.render(80).join("\n")).not.toContain("Enter: confirm");
    });

    it("still renders exactly contentHeight lines with the hints hidden", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [textField()],
        theme: createTheme(),
        onDone: () => {},
        hideHint: true,
        contentHeight: 12,
      });

      const lines = editor.render(80);
      expect(lines).toHaveLength(12);
      // The description stays bottom-anchored; the freed hint lines are
      // absorbed by the padding.
      const descIndex = lines.findIndex((line) =>
        line.includes("A short description."),
      );
      expect(descIndex).toBe(11);

      editor.handleInput(ENTER);
      expect(editor.render(80)).toHaveLength(12);
    });

    it("renders the same hints as before when hideHint is not set", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [textField()],
        theme: createTheme(),
        onDone: () => {},
      });

      const rendered = editor.render(80).join("\n");
      expect(rendered).toContain(
        "↑/↓ or j/k navigate · Enter edit/open · Esc back",
      );

      editor.handleInput(ENTER);
      expect(editor.render(80).join("\n")).toContain(
        "Enter: confirm · Esc: cancel",
      );
    });
  });

  describe("contentHeight", () => {
    const LONG_DESCRIPTION =
      "This description is intentionally very long so that it wraps onto " +
      "several lines at narrow widths and its tail end is clipped.";

    function makeBooleanFields(
      count: number,
      description?: string,
    ): SettingsDetailField[] {
      return Array.from({ length: count }, (_, i) => ({
        id: `field-${i}`,
        type: "boolean" as const,
        label: `Field ${String(i).padStart(2, "0")}`,
        description: i === 0 ? description : undefined,
        getValue: () => false,
        setValue: () => {},
      }));
    }

    function makeEditor(
      fields: SettingsDetailField[],
      contentHeight: number,
    ): SettingsDetailEditor {
      return new SettingsDetailEditor({
        title: "Details",
        fields,
        theme: createTheme(),
        onDone: () => {},
        contentHeight,
      });
    }

    it("list mode pads to contentHeight with a bottom-anchored wrapped description and a shrunken window", () => {
      const editor = makeEditor(makeBooleanFields(12, LONG_DESCRIPTION), 12);

      const lines = editor.render(40);
      expect(lines).toHaveLength(12);
      const rendered = lines.join("\n");
      // The description is fully wrapped, never truncated.
      expect(rendered).toContain("clipped.");
      expect(rendered).not.toContain("...");
      // The field window shrank to make room: only 2 of 12 fields show.
      expect(rendered).toContain("Field 00");
      expect(rendered).not.toContain("Field 02");
      expect(rendered).toContain("(1/12)");
      // The description's last line sits immediately above the hint block.
      expect(lines[9]).toContain("clipped.");
      expect(lines[10]).toBe("");
      expect(lines[11]).toContain("Esc back");
    });

    it("list mode bottom-anchors a short description with blank padding above it", () => {
      const editor = makeEditor(
        makeBooleanFields(2, "A short description."),
        12,
      );

      const lines = editor.render(80);
      expect(lines).toHaveLength(12);
      const descIndex = lines.findIndex((line) =>
        line.includes("A short description."),
      );
      expect(descIndex).toBe(9);
      expect(lines[10]).toBe("");
      expect(lines[11]).toContain("Esc back");
      // The space between the field list and the description is blank padding.
      expect(lines.slice(4, 9).every((line) => line === "")).toBe(true);
    });

    it("text-editing mode renders exactly contentHeight lines", () => {
      const fields: SettingsDetailField[] = [
        {
          id: "theme",
          type: "text",
          label: "Theme",
          getValue: () => "dark",
          setValue: () => {},
        },
      ];
      const editor = makeEditor(fields, 12);

      editor.handleInput(ENTER);

      const lines = editor.render(80);
      expect(lines).toHaveLength(12);
      expect(lines.join("\n")).toContain("Theme");
    });

    it("empty state renders exactly contentHeight lines", () => {
      const editor = makeEditor([], 12);

      const lines = editor.render(80);
      expect(lines).toHaveLength(12);
      expect(lines.join("\n")).toContain("No editable fields");
    });

    it("renders identically when the option is unset", () => {
      const withoutOption = new SettingsDetailEditor({
        title: "Details",
        fields: makeBooleanFields(3, "A short description."),
        theme: createTheme(),
        onDone: () => {},
      });

      const baseline = withoutOption.render(40);
      expect(
        makeEditor(makeBooleanFields(3, "A short description."), 0).render(40),
      ).toEqual(baseline);
      // No padding is added: title block + fields + description + hint.
      expect(baseline.join("\n")).toContain("A short description.");
    });
  });

  describe("header fields", () => {
    const header = (id: string, value?: string): SettingsDetailField => ({
      id,
      type: "header" as const,
      label: `Header ${id}`,
      value,
    });
    const bool = (id: string): SettingsDetailField => ({
      id,
      type: "boolean" as const,
      label: `Bool ${id}`,
      getValue: () => false,
      setValue: () => {},
    });

    it("starts the selection on the first non-header row", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [header("a"), bool("b")],
        theme: createTheme(),
        onDone: () => {},
      });

      expect(editor.render(80).join("\n")).toContain("> Bool b");
    });

    it("skips headers when navigating in both directions, with wrap", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [bool("a"), header("h"), bool("b")],
        theme: createTheme(),
        onDone: () => {},
      });

      expect(editor.render(80).join("\n")).toContain("> Bool a");
      editor.handleInput("j");
      expect(editor.render(80).join("\n")).toContain("> Bool b");
      editor.handleInput("j");
      expect(editor.render(80).join("\n")).toContain("> Bool a");
      editor.handleInput("k");
      expect(editor.render(80).join("\n")).toContain("> Bool b");
    });

    it("does not activate a header on Enter", () => {
      const doneCalls: Array<string | undefined> = [];
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [header("only")],
        theme: createTheme(),
        onDone: (summary) => doneCalls.push(summary),
      });

      // Enter is a no-op; navigation does not loop forever; Esc still exits.
      editor.handleInput(ENTER);
      editor.handleInput("j");
      editor.handleInput("k");
      editor.handleInput(ESC);
      expect(doneCalls).toHaveLength(1);
    });

    it("renders the optional value dimmed in the value column", () => {
      const editor = new SettingsDetailEditor({
        title: "Details",
        fields: [bool("a"), header("stale", "not served by gateway")],
        theme: createTheme(),
        onDone: () => {},
      });

      const lines = editor.render(80).join("\n");
      expect(lines).toContain("Header stale");
      expect(lines).toContain("not served by gateway");
      // Inert row: no cursor on the header even after moving down from the
      // only selectable row (wraps back).
      editor.handleInput("j");
      expect(editor.render(80).join("\n")).toContain("> Bool a");
    });
  });
});
