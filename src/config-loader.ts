/**
 * Generic JSON config loader for pi extensions.
 *
 * Loads config from configurable scopes (global, local, memory),
 * deep-merges with defaults, and optionally applies versioned migrations.
 *
 * Global:  ~/.pi/agent/extensions/{name}.json
 * Local:   {project}/.pi/extensions/{name}.json (walks up to find .pi)
 * Memory:  In-memory only, not persisted, resets on reload
 *
 * Merge priority (lowest to highest): defaults -> global -> local -> memory
 */

import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Available configuration scopes.
 * - global: User-wide settings in ~/.pi/agent/extensions/
 * - local: Project-specific settings in {project}/.pi/extensions/
 * - memory: Ephemeral settings, not persisted, reset on reload
 */
export type Scope = "global" | "local" | "memory";

/**
 * Context passed to migration hooks.
 */
export interface MigrationContext {
  /** Path of the config file being migrated. */
  filePath: string;
  /** Names of migrations already applied during this load, in order. */
  appliedMigrations: readonly string[];
  /**
   * Config version before this migration runs (after prior migrations).
   * 0 (numeric scheme) or "0.0.0" (semver scheme) if unset.
   */
  fromVersion: number | string;
  /** This migration's declared version, or fromVersion when unset. */
  toVersion: number | string;
}

/**
 * Function that produces an optional migration message.
 * Receives the config before and after the migration ran.
 * Return undefined to skip the message.
 */
export type MigrationMessageFactory<TConfig> = (
  before: TConfig,
  after: TConfig,
  filePath: string,
  ctx: MigrationContext,
) => string | undefined;

/**
 * A migration that transforms a config from one version to another.
 * Migrations are applied in order during load(). If any migration
 * returns a modified config, the result is saved back to disk.
 *
 * Migrations can declare a monotonic `version`: either a non-negative
 * integer or a semver string (e.g. the extension's package version).
 * When set and `shouldRun` is omitted, the migration runs when the
 * config's stamped `version` is lower. After a versioned migration runs,
 * the loader stamps the config file with the highest version applied.
 *
 * All versioned migrations in one loader must use the same scheme:
 * all integers or all semver strings (no prerelease tags). Mixing
 * schemes throws at construction. Extensions that already stamp integer
 * versions should keep integers; switching to semver changes the
 * ordering (e.g. a stamped 3 reads as 3.0.0, which is above "1.2.0").
 */
export interface Migration<TConfig> {
  /** Name for logging on failure. */
  name: string;
  /**
   * Monotonic config version this migration brings the config to.
   * A non-negative integer, or a semver string without prerelease/build
   * metadata (e.g. "1.2.0"; "1.2" reads as "1.2.0").
   * When set, enables the default `shouldRun` (config version < version)
   * and automatic version stamping after a successful run.
   */
  version?: number | string;
  /**
   * Return true if this migration should run on the given config.
   * Optional when `version` is set: defaults to a version comparison.
   */
  shouldRun?: (config: TConfig, ctx: MigrationContext) => boolean;
  /**
   * Optional user-facing message emitted when this migration
   * successfully runs. Evaluated against the pre-migration config.
   * If a function is provided, it receives the config before
   * the migration's run() is called.
   */
  message?: string | MigrationMessageFactory<TConfig>;
  /**
   * Transform the config. Receives the file path for backup/logging
   * and a context with version and applied-migration history.
   * Return the migrated config.
   */
  run: (
    config: TConfig,
    filePath: string,
    ctx: MigrationContext,
  ) => Promise<TConfig> | TConfig;
}

/**
 * Interface for settings storage, used by registerSettingsCommand.
 * ConfigLoader implements this. Extensions with custom loaders can
 * implement this interface directly.
 */
export interface ConfigStore<TConfig extends object, TResolved extends object> {
  getConfig(): TResolved;
  getRawConfig(scope: Scope): TConfig | null;
  hasScope(scope: Scope): boolean;
  hasConfig(scope: Scope): boolean;
  getEnabledScopes(): Scope[];
  save(scope: Scope, config: TConfig): Promise<void>;
}

/**
 * Version scheme used by a loader's versioned migrations.
 * All versioned migrations in one loader must share the same scheme.
 */
type VersionScheme = "number" | "semver";

/**
 * Helper for config types used with versioned migrations.
 * The loader stamps a `version` field whose type matches the loader's
 * version scheme: number for integer migrations, string for semver.
 * Use `YourConfig & VersionedConfig` (or declare `version?: number | string`)
 * so the stamped value typechecks.
 */
export interface VersionedConfig {
  version?: number | string;
}

/** Semver core without prerelease/build metadata; minor/patch may be omitted. */
const SEMVER_PATTERN = /^(\d{1,15})(?:\.(\d{1,15}))?(?:\.(\d{1,15}))?$/;

function isSemverString(value: string): boolean {
  return SEMVER_PATTERN.test(value);
}

/**
 * Parse a semver string into [major, minor, patch].
 * Missing minor/patch default to 0, so "1.2" reads as 1.2.0.
 * Returns null when the value is not a plain semver core.
 */
function parseSemver(value: string): [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

/** Compare two semver strings. Returns negative, 0, or positive. */
function compareSemver(a: string, b: string): number {
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
function compareVersions(
  a: number | string,
  b: number | string,
  scheme: VersionScheme,
): number {
  if (scheme === "semver") return compareSemver(String(a), String(b));
  return Number(a) - Number(b);
}

/** The version treated as "unset" for a scheme. */
function zeroVersion(scheme: VersionScheme): number | string {
  return scheme === "semver" ? "0.0.0" : 0;
}

/**
 * Read the stamped config version from a raw config object.
 * Numeric scheme: returns 0 when unset or not a finite number.
 * Semver scheme: returns "0.0.0" when unset or unparseable; a bare
 * legacy integer stamp (e.g. 3) reads as its semver form (3.0.0).
 */
function readVersion(
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
function stampVersion<TConfig>(
  config: TConfig,
  version: number | string,
): TConfig {
  return { ...(config as object), version } as TConfig;
}

/**
 * Walk up from cwd to find the project root (.pi directory).
 * Stops at home directory.
 * Returns the path to .pi/extensions/{name}.json, or null if no .pi found.
 */
function findLocalConfigPath(extensionName: string): string | null {
  let dir = process.cwd();
  const home = homedir();

  while (true) {
    // Stop at home directory — ~/.pi is global, not project-local.
    if (dir === home) break;

    const piDir = resolve(dir, ".pi");
    if (existsSync(piDir) && statSync(piDir).isDirectory()) {
      return resolve(piDir, `extensions/${extensionName}.json`);
    }

    const parent = resolve(dir, "..");
    // Stop if we can't go higher
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

export class ConfigLoader<TConfig extends object, TResolved extends object>
  implements ConfigStore<TConfig, TResolved>
{
  private globalConfig: TConfig | null = null;
  private localConfig: TConfig | null = null;
  private memoryConfig: TConfig | null = null;
  private resolved: TResolved | null = null;
  private pendingMessages: string[] = [];

  private readonly scopes: Scope[];
  private readonly globalPath: string | null;
  private localPath: string | null;
  private readonly defaults: TResolved;
  private readonly extensionName: string;
  private readonly migrations: Migration<TConfig>[];
  private readonly versionScheme: VersionScheme;
  private readonly schemaUrl?: string;
  private readonly afterMerge?: (
    resolved: TResolved,
    global: TConfig | null,
    local: TConfig | null,
    memory: TConfig | null,
  ) => TResolved;

  constructor(
    extensionName: string,
    defaults: TResolved,
    options?: {
      /**
       * Enabled scopes. Default: ["global", "local"]
       * Merge priority (lowest to highest): defaults -> global -> local -> memory
       */
      scopes?: Scope[];
      migrations?: Migration<TConfig>[];
      /**
       * URL to a JSON Schema file. When set, `save()` prepends a
       * `$schema` field to the written JSON and `readFile()` strips it
       * before returning `TConfig`.
       */
      schemaUrl?: string;
      /**
       * Post-merge hook. Called after deep merge with all raw configs.
       * Use for logic that can't be expressed as a simple merge
       * (e.g., one field replacing another).
       */
      afterMerge?: (
        resolved: TResolved,
        global: TConfig | null,
        local: TConfig | null,
        memory: TConfig | null,
      ) => TResolved;
    },
  ) {
    this.scopes = options?.scopes ?? ["global", "local"];
    this.defaults = defaults;
    this.extensionName = extensionName;
    this.migrations = options?.migrations ?? [];
    this.schemaUrl = options?.schemaUrl;
    this.afterMerge = options?.afterMerge;

    let previousVersion: number | string | undefined;
    let scheme: VersionScheme | undefined;
    for (const migration of this.migrations) {
      if (!migration.shouldRun && migration.version === undefined) {
        throw new Error(
          `[settings] Migration "${migration.name}" needs shouldRun or version`,
        );
      }
      if (migration.version !== undefined) {
        if (typeof migration.version === "string") {
          if (!isSemverString(migration.version)) {
            throw new Error(
              `[settings] Migration "${migration.name}" version must be a non-negative integer or a semver string without prerelease/build metadata, got ${migration.version}`,
            );
          }
          if (scheme === "number") {
            throw new Error(
              `[settings] Migration "${migration.name}" mixes version schemes: earlier versioned migrations use integers, got semver string ${migration.version}`,
            );
          }
          scheme = "semver";
        } else {
          if (
            !Number.isSafeInteger(migration.version) ||
            migration.version < 0
          ) {
            throw new Error(
              `[settings] Migration "${migration.name}" version must be a non-negative integer, got ${migration.version}`,
            );
          }
          if (scheme === "semver") {
            throw new Error(
              `[settings] Migration "${migration.name}" mixes version schemes: earlier versioned migrations use semver strings, got integer ${migration.version}`,
            );
          }
          scheme = "number";
        }
        if (
          previousVersion !== undefined &&
          compareVersions(migration.version, previousVersion, scheme) <= 0
        ) {
          throw new Error(
            `[settings] Migration "${migration.name}" version ${migration.version} must be greater than the previous versioned migration (${previousVersion})`,
          );
        }
        previousVersion = migration.version;
      }
    }
    this.versionScheme = scheme ?? "number";

    // Set up paths based on enabled scopes
    this.globalPath = this.scopes.includes("global")
      ? resolve(getAgentDir(), `extensions/${extensionName}.json`)
      : null;

    this.localPath = this.scopes.includes("local")
      ? findLocalConfigPath(extensionName)
      : null;
  }

  /**
   * Load (or reload) config from disk. Applies migrations if needed.
   * Must be called before getConfig() or getRawConfig().
   *
   * Note: Memory config is reset to null on reload (ephemeral).
   */
  async load(): Promise<void> {
    // Load from disk
    this.globalConfig = this.globalPath
      ? await this.readFile(this.globalPath)
      : null;
    this.localConfig = this.localPath
      ? await this.readFile(this.localPath)
      : null;

    // Reset memory on reload (ephemeral)
    this.memoryConfig = null;

    // Apply migrations to disk configs
    if (this.globalConfig && this.globalPath) {
      this.globalConfig = await this.applyMigrations(
        this.globalConfig,
        this.globalPath,
      );
    }
    if (this.localConfig && this.localPath) {
      this.localConfig = await this.applyMigrations(
        this.localConfig,
        this.localPath,
      );
    }

    this.resolved = this.merge();
  }

  getConfig(): TResolved {
    if (!this.resolved) {
      throw new Error("Config not loaded. Call load() first.");
    }
    return this.resolved;
  }

  getRawConfig(scope: Scope): TConfig | null {
    switch (scope) {
      case "global":
        return this.globalConfig;
      case "local":
        return this.localConfig;
      case "memory":
        return this.memoryConfig;
    }
  }

  hasScope(scope: Scope): boolean {
    return this.scopes.includes(scope);
  }

  hasConfig(scope: Scope): boolean {
    if (!this.hasScope(scope)) return false;
    return this.getRawConfig(scope) !== null;
  }

  getEnabledScopes(): Scope[] {
    return [...this.scopes];
  }

  /** Drain (remove and return) all pending migration messages. */
  drainMessages(): string[] {
    return this.pendingMessages.splice(0);
  }

  /**
   * Read the stamped config version. With a scope, reads that scope's raw
   * config. Without a scope, returns the highest version across raw configs
   * (0 or "0.0.0" when no config or version exists, per the loader's
   * version scheme). Requires load() first.
   */
  getVersion(scope?: Scope): number | string {
    if (scope) {
      const raw = this.getRawConfig(scope);
      return raw
        ? readVersion(raw, this.versionScheme)
        : zeroVersion(this.versionScheme);
    }
    let version = zeroVersion(this.versionScheme);
    for (const raw of [this.globalConfig, this.localConfig]) {
      if (raw) {
        const candidate = readVersion(raw, this.versionScheme);
        if (compareVersions(candidate, version, this.versionScheme) > 0) {
          version = candidate;
        }
      }
    }
    return version;
  }

  /** Save config and reload state (except memory which just updates in place). */
  async save(scope: Scope, config: TConfig): Promise<void> {
    if (!this.hasScope(scope)) {
      throw new Error(`Scope "${scope}" is not enabled`);
    }

    if (scope === "memory") {
      // Memory is ephemeral, just store in place and re-merge
      this.memoryConfig = config;
      this.resolved = this.merge();
      return;
    }

    const path = scope === "global" ? this.globalPath : this.localPath;

    // Fallback: create .pi/extensions/ in cwd for local scope if no path found
    if (!path && scope === "local") {
      this.localPath = resolve(
        process.cwd(),
        `.pi/extensions/${this.extensionName}.json`,
      );
    }

    const finalPath = scope === "global" ? this.globalPath : this.localPath;
    if (!finalPath) {
      throw new Error(`No path configured for scope "${scope}"`);
    }

    await this.writeFile(finalPath, config);

    // Reload disk configs but preserve memory
    const savedMemory = this.memoryConfig;
    this.globalConfig = this.globalPath
      ? await this.readFile(this.globalPath)
      : null;
    this.localConfig = this.localPath
      ? await this.readFile(this.localPath)
      : null;
    this.memoryConfig = savedMemory;
    this.resolved = this.merge();
  }

  // --- Internal ---

  private async applyMigrations(
    config: TConfig,
    filePath: string,
  ): Promise<TConfig> {
    let current = config;
    let changed = false;
    let currentVersion = readVersion(config, this.versionScheme);
    const appliedMigrations: string[] = [];

    for (const migration of this.migrations) {
      const ctx: MigrationContext = {
        filePath,
        appliedMigrations,
        fromVersion: currentVersion,
        toVersion: migration.version ?? currentVersion,
      };

      const shouldRun = migration.shouldRun
        ? migration.shouldRun(current, ctx)
        : compareVersions(
            currentVersion,
            migration.version as number | string,
            this.versionScheme,
          ) < 0;
      if (!shouldRun) continue;

      const before = current;

      try {
        current = await migration.run(current, filePath, ctx);
        changed = true;
        appliedMigrations.push(migration.name);

        if (
          migration.version !== undefined &&
          compareVersions(
            migration.version,
            currentVersion,
            this.versionScheme,
          ) > 0
        ) {
          currentVersion = migration.version;
          current = stampVersion(current, currentVersion);
        }

        const message = this.resolveMigrationMessage(
          migration,
          before,
          current,
          filePath,
          ctx,
        );
        if (message) {
          this.pendingMessages.push(message);
        }
      } catch (error) {
        console.error(
          `[settings] Migration "${migration.name}" failed for ${filePath}: ${error}`,
        );
        // Stop after a failed versioned migration: continuing would let a
        // later migration stamp a higher version, permanently skipping the
        // failed one on subsequent loads.
        if (migration.version !== undefined) break;
      }
    }

    if (changed) {
      try {
        await this.writeFile(filePath, current);
      } catch (err) {
        console.error(
          `[settings] Failed to save migrated config to ${filePath}: ${err}`,
        );
      }
    }

    return current;
  }

  private resolveMigrationMessage(
    migration: Migration<TConfig>,
    before: TConfig,
    after: TConfig,
    filePath: string,
    ctx: MigrationContext,
  ): string | undefined {
    if (!migration.message) return undefined;

    try {
      return typeof migration.message === "function"
        ? migration.message(before, after, filePath, ctx)
        : migration.message;
    } catch (error) {
      console.error(
        `[settings] Failed to build migration message "${migration.name}" for ${filePath}: ${error}`,
      );
      return undefined;
    }
  }

  private merge(): TResolved {
    const merged = structuredClone(this.defaults);

    // Merge in priority order: global -> local -> memory
    if (this.globalConfig) this.deepMerge(merged, this.globalConfig);
    if (this.localConfig) this.deepMerge(merged, this.localConfig);
    if (this.memoryConfig) this.deepMerge(merged, this.memoryConfig);

    if (this.afterMerge) {
      return this.afterMerge(
        merged,
        this.globalConfig,
        this.localConfig,
        this.memoryConfig,
      );
    }
    return merged;
  }

  private deepMerge(target: object, source: object): void {
    const t = target as Record<string, unknown>;
    const s = source as Record<string, unknown>;
    for (const key in s) {
      if (s[key] === undefined) continue;
      if (
        typeof s[key] === "object" &&
        !Array.isArray(s[key]) &&
        s[key] !== null
      ) {
        if (!t[key] || typeof t[key] !== "object") t[key] = {};
        this.deepMerge(t[key] as object, s[key] as object);
      } else {
        t[key] = s[key];
      }
    }
  }

  private async readFile(path: string): Promise<TConfig | null> {
    try {
      const content = await readFile(path, "utf-8");
      const parsed = JSON.parse(content);
      // Strip $schema so it doesn't leak into config types
      const { $schema: _, ...rest } = parsed;
      return rest as TConfig;
    } catch {
      return null;
    }
  }

  private async writeFile(path: string, config: TConfig): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const output = this.schemaUrl
      ? { $schema: this.schemaUrl, ...config }
      : config;
    await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  }
}

/**
 * Create a ConfigStore that delegates to a ConfigLoader.
 *
 * Replaces hand-written wrapper objects. Pass `scopes` to expose only a
 * subset of the loader's enabled scopes to the settings UI.
 */
export function createConfigStore<
  TConfig extends object,
  TResolved extends object,
>(
  loader: ConfigLoader<TConfig, TResolved>,
  options?: { scopes?: Scope[] },
): ConfigStore<TConfig, TResolved> {
  const scopes = options?.scopes;
  return {
    getConfig: () => loader.getConfig(),
    getRawConfig: (scope) => loader.getRawConfig(scope),
    hasScope: (scope) => loader.hasScope(scope),
    hasConfig: (scope) => loader.hasConfig(scope),
    getEnabledScopes: () => scopes ?? loader.getEnabledScopes(),
    save: (scope, config) => loader.save(scope, config),
  };
}
