import { describe, expect, it, vi } from "vitest";
import { DOWN, ENTER, ESC, UP } from "../test/keys";
import { createSettingsListTheme } from "../test/theme";
import { FuzzySelector } from "./fuzzy-selector";

const BOX_CHARS = /[╭╮╰╯│├┤─]/;

describe("FuzzySelector", () => {
  it("uses plain list mode at or below threshold and selects with arrows", () => {
    const onSelect = vi.fn();
    const onDone = vi.fn();

    const selector = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta", "Gamma"],
      theme: createSettingsListTheme(),
      onSelect,
      onDone,
      searchThreshold: 3,
    });

    const rendered = selector.render(80).join("\n");
    expect(rendered).not.toContain("Search:");
    expect(rendered).toContain("↑/↓: move · Enter: select · Esc: back");

    selector.handleInput(DOWN);
    selector.handleInput(ENTER);

    expect(onSelect).toHaveBeenCalledWith("Beta");
    selector.handleInput(ESC);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("uses fuzzy mode above threshold and filters", () => {
    const onSelect = vi.fn();

    const selector = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta", "Gamma", "Delta"],
      theme: createSettingsListTheme(),
      onSelect,
      onDone: () => {},
      searchThreshold: 3,
    });

    expect(selector.render(80).join("\n")).toContain("Search:");

    selector.handleInput("g");
    selector.handleInput(ENTER);

    expect(onSelect).toHaveBeenCalledWith("Gamma");
  });

  it("respects currentValue pre-selection in plain list mode", () => {
    const onSelect = vi.fn();

    const selector = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta", "Gamma"],
      currentValue: "Gamma",
      theme: createSettingsListTheme(),
      onSelect,
      onDone: () => {},
      searchThreshold: 7,
    });

    selector.handleInput(ENTER);
    expect(onSelect).toHaveBeenCalledWith("Gamma");
  });

  it("respects currentValue pre-selection in fuzzy mode when query is empty", () => {
    const onSelect = vi.fn();

    const selector = new FuzzySelector({
      label: "Pick",
      items: [
        "Alpha",
        "Beta",
        "Gamma",
        "Delta",
        "Epsilon",
        "Zeta",
        "Eta",
        "Theta",
      ],
      currentValue: "Theta",
      theme: createSettingsListTheme(),
      onSelect,
      onDone: () => {},
      searchThreshold: 7,
    });

    selector.handleInput(ENTER);
    expect(onSelect).toHaveBeenCalledWith("Theta");

    selector.handleInput(UP);
    selector.handleInput(ENTER);
    expect(onSelect).toHaveBeenLastCalledWith("Eta");
  });

  it("renders unframed with a plain title line in plain list mode", () => {
    const selector = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 7,
    });

    const lines = selector.render(80);
    expect(lines[0]).toBe(" Pick");
    expect(lines[1]).toBe("");
    expect(lines.join("\n")).not.toMatch(BOX_CHARS);
  });

  it("renders without box-drawing characters in search and no-matches modes", () => {
    const selector = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta", "Gamma", "Delta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 3,
    });

    expect(selector.render(80).join("\n")).not.toMatch(BOX_CHARS);
    expect(selector.render(80).join("\n")).toContain(" Pick");

    for (const ch of "zzzz") selector.handleInput(ch);
    const rendered = selector.render(80).join("\n");
    expect(rendered).not.toMatch(BOX_CHARS);
    expect(rendered).toContain("(no matches)");
  });

  it("reports shortcuts per mode via getShortcuts", () => {
    const plain = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 7,
    });
    expect(plain.getShortcuts()).toBe("↑/↓: move · Enter: select · Esc: back");

    const search = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta", "Gamma", "Delta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 3,
    });
    expect(search.getShortcuts()).toBe(
      "Type to search · Enter: select · Esc: back",
    );

    for (const ch of "zzzz") search.handleInput(ch);
    expect(search.getShortcuts()).toBe("Type to search · Esc: back");
  });

  it("hides the footer hint when hideHint is set and shows it by default", () => {
    const hidden = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 7,
      hideHint: true,
    });
    expect(hidden.render(80).join("\n")).not.toContain("Enter: select");

    const shown = new FuzzySelector({
      label: "Pick",
      items: ["Alpha", "Beta"],
      theme: createSettingsListTheme(),
      onSelect: () => {},
      onDone: () => {},
      searchThreshold: 7,
    });
    expect(shown.render(80).join("\n")).toContain(
      "↑/↓: move · Enter: select · Esc: back",
    );
  });
});
