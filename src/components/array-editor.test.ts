import type { SettingsListTheme } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { ArrayEditor, type ArrayEditorOptions } from "./array-editor";

const ENTER = "\r";
const ESC = "";
const BOX_CHARS = /[╭╮╰╯│├┤─]/;

function createTheme(): SettingsListTheme {
  return {
    label: (text: string) => text,
    value: (text: string) => text,
    description: (text: string) => text,
    cursor: "→ ",
    hint: (text: string) => text,
  };
}

function makeEditor(options: Partial<ArrayEditorOptions> = {}) {
  return new ArrayEditor({
    label: "Tags",
    items: ["one", "two"],
    theme: createTheme(),
    onSave: vi.fn(),
    onDone: vi.fn(),
    ...options,
  });
}

describe("ArrayEditor", () => {
  it("renders unframed with a plain title line in list mode", () => {
    const editor = makeEditor();

    const lines = editor.render(80);
    expect(lines[0]).toBe(" Tags");
    expect(lines[1]).toBe("");
    expect(lines.join("\n")).not.toMatch(BOX_CHARS);
    expect(lines.join("\n")).toContain("one");
  });

  it("renders without box-drawing characters in add and edit modes", () => {
    const editor = makeEditor();

    editor.handleInput("a"); // add mode
    let rendered = editor.render(80).join("\n");
    expect(rendered).not.toMatch(BOX_CHARS);
    expect(rendered).toContain("New item:");

    editor.handleInput(ESC); // back to list
    editor.handleInput(ENTER); // edit mode
    rendered = editor.render(80).join("\n");
    expect(rendered).not.toMatch(BOX_CHARS);
    expect(rendered).toContain("Edit item:");
  });

  it("renders without box-drawing characters when empty", () => {
    const editor = makeEditor({ items: [] });

    const rendered = editor.render(80).join("\n");
    expect(rendered).not.toMatch(BOX_CHARS);
    expect(rendered).toContain("(empty)");
  });

  it("reports shortcuts per mode via getShortcuts", () => {
    const editor = makeEditor();
    expect(editor.getShortcuts()).toBe(
      "a: add · e/Enter: edit · d: delete · Esc: back",
    );

    editor.handleInput("a");
    expect(editor.getShortcuts()).toBe("Enter: confirm · Esc: cancel");

    editor.handleInput(ESC);
    expect(editor.getShortcuts()).toBe(
      "a: add · e/Enter: edit · d: delete · Esc: back",
    );

    editor.handleInput(ENTER); // edit mode
    expect(editor.getShortcuts()).toBe("Enter: confirm · Esc: cancel");
  });

  it("shows footer hints by default in list and input modes", () => {
    const editor = makeEditor();

    expect(editor.render(80).join("\n")).toContain(
      "a: add · e/Enter: edit · d: delete · Esc: back",
    );

    editor.handleInput("a");
    expect(editor.render(80).join("\n")).toContain(
      "Enter: confirm · Esc: cancel",
    );
  });

  it("hides footer hints in all modes when hideHint is set", () => {
    const editor = makeEditor({ hideHint: true });

    expect(editor.render(80).join("\n")).not.toContain("a: add");

    editor.handleInput("a");
    expect(editor.render(80).join("\n")).not.toContain("Enter: confirm");
  });
});
