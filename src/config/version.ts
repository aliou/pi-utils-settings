/**
 * Version parsing, comparison, and stamping for config migrations.
 *
 * Migrations can declare a monotonic `version` as a non-negative integer
 * or a semver string. All versioned migrations in one loader must share
 * the same scheme: integers compare numerically, semver strings compare
 * component-wise ("1.2" reads as "1.2.0").
 */

/**
 * Version scheme used by a loader's versioned migrations.
 * All versioned migrations in one loader must share the same scheme.
 */
export type VersionScheme = "number" | "semver";

/** Semver core without prerelease/build metadata; minor/patch may be omitted. */
const SEMVER_PATTERN = /^(\d{1,15})(?:\.(\d{1,15}))?(?:\.(\d{1,15}))?$/;

export function isSemverString(value: string): boolean {
  return SEMVER_PATTERN.test(value);
}

/**
 * Parse a semver string into [major, minor, patch].
 * Missing minor/patch default to 0, so "1.2" reads as 1.2.0.
 * Returns null when the value is not a plain semver core.
 */
export function parseSemver(value: string): [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Compare two semver strings. Returns negative, 0, or positive. */
export function compareSemver(a: string, b: string): number {
  const pa: [number, number, number] = parseSemver(a) ?? [0, 0, 0];
  const pb: [number, number, number] = parseSemver(b) ?? [0, 0, 0];
  for (const i of [0, 1, 2] as const) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Compare two versions of the same scheme.
 * Returns negative, 0, or positive.
 */
export function compareVersions(
  a: number | string,
  b: number | string,
  scheme: VersionScheme,
): number {
  if (scheme === "semver") return compareSemver(String(a), String(b));
  return Number(a) - Number(b);
}

/** The version treated as "unset" for a scheme. */
export function zeroVersion(scheme: VersionScheme): number | string {
  return scheme === "semver" ? "0.0.0" : 0;
}

/**
 * Read the stamped config version from a raw config object.
 * Numeric scheme: returns 0 when unset or not a finite number.
 * Semver scheme: returns "0.0.0" when unset or unparseable; a bare
 * legacy integer stamp (e.g. 3) reads as its semver form (3.0.0).
 */
export function readVersion(
  config: object,
  scheme: VersionScheme = "number",
): number | string {
  const value = (config as Record<string, unknown>).version;
  if (scheme === "semver") {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (isSemverString(trimmed)) return trimmed;
    } else if (typeof value === "number" && Number.isSafeInteger(value)) {
      return String(value);
    }
    return "0.0.0";
  }
  const version = typeof value === "number" ? value : Number(value);
  return Number.isFinite(version) ? version : 0;
}

/** Return a copy of the config with the version field stamped. */
export function stampVersion<TConfig>(
  config: TConfig,
  version: number | string,
): TConfig {
  return { ...(config as object), version } as TConfig;
}
