/** Render-assertion helpers shared by component tests. */

/** Count non-overlapping occurrences of needle in haystack. */
export function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
