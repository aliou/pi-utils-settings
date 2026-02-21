/**
 * A multi-select list with fuzzy search filtering.
 *
 * Features:
 * - Type to filter items via fuzzy search
 * - Navigate with up/down arrows
 * - Space to toggle selection
 * - Ctrl+A to select all visible, Ctrl+X to clear all visible
 * - Locked items shown greyed and non-toggleable
 * - Optional recommended marker (*)
 * - Scrolls when items exceed maxVisible
 */

import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import {
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

export interface FuzzyMultiSelectorItem {
  label: string;
  description?: string;
  /** Dim suffix shown after the label (e.g. skill count). */
  suffix?: string;
  checked: boolean;
  locked?: boolean;
  lockedBy?: string;
  recommended?: boolean;
}

export interface FuzzyMultiSelectorOptions {
  label: string;
  items: FuzzyMultiSelectorItem[];
  theme: SettingsListTheme;
  maxVisible?: number;
  /** Called after any toggle. */
  onToggle?: (item: FuzzyMultiSelectorItem) => void;
}

export class FuzzyMultiSelector implements Component {
  private allItems: FuzzyMultiSelectorItem[];
  private filteredItems: FuzzyMultiSelectorItem[];
  private label: string;
  private theme: SettingsListTheme;
  private onToggle?: (item: FuzzyMultiSelectorItem) => void;
  private selectedIndex = 0;
  private maxVisible: number;
  private input: Input;

  constructor(options: FuzzyMultiSelectorOptions) {
    this.allItems = options.items;
    this.filteredItems = [...this.allItems];
    this.label = options.label;
    this.theme = options.theme;
    this.onToggle = options.onToggle;
    this.maxVisible = options.maxVisible ?? 12;
    this.input = new Input();
  }

  /** Get all items (including non-visible due to filtering). */
  getItems(): FuzzyMultiSelectorItem[] {
    return this.allItems;
  }

  /** Get only checked items. */
  getCheckedItems(): FuzzyMultiSelectorItem[] {
    return this.allItems.filter((i) => i.checked);
  }

  /** Recompute the filtered list and clamp the cursor. Call after external item mutations. */
  refresh(): void {
    this.updateFilter();
  }

  private updateFilter(): void {
    const query = this.input.getValue();
    if (query.trim() === "") {
      this.filteredItems = [...this.allItems];
    } else {
      this.filteredItems = fuzzyFilter(
        this.allItems,
        query,
        (item) => `${item.label} ${item.description ?? ""}`,
      );
    }
    this.selectedIndex = Math.min(
      this.selectedIndex,
      Math.max(0, this.filteredItems.length - 1),
    );
  }

  invalidate(): void {}

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(this.theme.label(` ${this.label}`, true));
    lines.push("");

    // Search input
    lines.push(this.theme.hint("  Search:"));
    lines.push(`  ${this.input.render(width - 4).join("")}`);
    lines.push("");

    // Count
    const checkedCount = this.allItems.filter((i) => i.checked).length;
    const lockedCount = this.allItems.filter(
      (i) => i.checked && i.locked,
    ).length;
    let countText = `${checkedCount} selected`;
    if (lockedCount > 0) countText += ` (${lockedCount} locked)`;
    lines.push(this.theme.hint(`  ${countText}`));
    lines.push("");

    // List
    if (this.filteredItems.length === 0) {
      lines.push(this.theme.hint("  (no matches)"));
    } else {
      const startIndex = Math.max(
        0,
        Math.min(
          this.selectedIndex - Math.floor(this.maxVisible / 2),
          this.filteredItems.length - this.maxVisible,
        ),
      );
      const endIndex = Math.min(
        startIndex + this.maxVisible,
        this.filteredItems.length,
      );

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.filteredItems[i];
        if (!item) continue;

        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? this.theme.cursor : "  ";
        const prefixWidth = visibleWidth(prefix);
        const checkbox = item.checked ? "[x]" : "[ ]";
        const rec = item.recommended ? " *" : "";
        const lockText =
          item.locked && item.lockedBy ? ` (via ${item.lockedBy})` : "";
        const suffixText = item.suffix
          ? ` ${this.theme.hint(item.suffix)}`
          : "";

        const maxItemWidth = width - prefixWidth - 2;
        const itemText = `${checkbox} ${item.label}${rec}${lockText}`;
        const text = item.locked
          ? this.theme.hint(truncateToWidth(itemText, maxItemWidth, ""))
          : this.theme.value(
              truncateToWidth(itemText, maxItemWidth, ""),
              isSelected,
            );
        lines.push(prefix + text + suffixText);
      }

      // Scroll indicator
      if (this.filteredItems.length > this.maxVisible) {
        lines.push(
          this.theme.hint(
            `  (${this.selectedIndex + 1}/${this.filteredItems.length})`,
          ),
        );
      }
    }

    // Description of current item
    const current = this.filteredItems[this.selectedIndex];
    if (current?.description) {
      lines.push("");
      lines.push(this.theme.hint(`  ${current.description}`));
    }

    lines.push("");
    lines.push(
      this.theme.hint("  Space toggle · ^A all · ^X clear · Enter confirm"),
    );

    return lines;
  }

  handleInput(data: string): void {
    // Navigation
    if (matchesKey(data, Key.up)) {
      if (this.filteredItems.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.filteredItems.length - 1
          : this.selectedIndex - 1;
      return;
    }

    if (matchesKey(data, Key.down)) {
      if (this.filteredItems.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === this.filteredItems.length - 1
          ? 0
          : this.selectedIndex + 1;
      return;
    }

    // Toggle on Space
    if (data === " ") {
      const item = this.filteredItems[this.selectedIndex];
      if (item && !item.locked) {
        item.checked = !item.checked;
        this.onToggle?.(item);
      }
      return;
    }

    // Ctrl+A - Select all visible
    if (matchesKey(data, Key.ctrl("a"))) {
      const targets = this.input.getValue()
        ? this.filteredItems
        : this.allItems;
      for (const item of targets) {
        if (!item.locked) item.checked = true;
      }
      return;
    }

    // Ctrl+X - Clear all visible
    if (matchesKey(data, Key.ctrl("x"))) {
      const targets = this.input.getValue()
        ? this.filteredItems
        : this.allItems;
      for (const item of targets) {
        if (!item.locked) item.checked = false;
      }
      return;
    }

    // Pass everything else to search input
    this.input.handleInput(data);
    this.updateFilter();
  }
}
