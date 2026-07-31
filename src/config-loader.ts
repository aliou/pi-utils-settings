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
  /** Config version before this migration runs (after prior migrations). 0 if unset. */
  fromVersion: number;
  /** This migration's declared version, or fromVersion when unset. */
  toVersion: number;
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
 * Migrations can declare a monotonic integer `version`. When set and
 * `shouldRun` is omitted, the migration runs when the config's stamped
 * `version` is lower. After a versioned migration runs, the loader stamps
 * the config file with the highest version applied.
 */
export interface Migration<TConfig> {
  /** Name for logging on failure. */
  name: string;
  /**
   * Monotonic integer config version this migration brings the config to.
   * When set, enables the default `shouldRun` (config version < version)
   * and automatic version stamping after a successful run.
   */
  version?: number;
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
 * Read the stamped config version from a raw config object.
 * Returns 0 when unset or not a finite number.
 */
function readVersion(config: object): number {
  const value = (config as Record<string, unknown>).version;
  const version = typeof value === "number" ? value : Number(value);
  return Number.isFinite(version) ? version : 0;
}

/** Return a copy of the config with the version field stamped. */
function stampVersion<TConfig>(config: TConfig, version: number): TConfig {
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

    let previousVersion: number | undefined;
    for (const migration of this.migrations) {
      if (!migration.shouldRun && migration.version === undefined) {
        throw new Error(
          `[settings] Migration "${migration.name}" needs shouldRun or version`,
        );
      }
      if (migration.version !== undefined) {
        if (!Number.isSafeInteger(migration.version) || migration.version < 0) {
          throw new Error(
            `[settings] Migration "${migration.name}" version must be a non-negative integer, got ${migration.version}`,
          );
        }
        if (
          previousVersion !== undefined &&
          migration.version <= previousVersion
        ) {
          throw new Error(
            `[settings] Migration "${migration.name}" version ${migration.version} must be greater than the previous versioned migration (${previousVersion})`,
          );
        }
        previousVersion = migration.version;
      }
    }

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
   * (0 when no config or version exists). Requires load() first.
   */
  getVersion(scope?: Scope): number {
    if (scope) {
      const raw = this.getRawConfig(scope);
      return raw ? readVersion(raw) : 0;
    }
    let version = 0;
    for (const raw of [this.globalConfig, this.localConfig]) {
      if (raw) version = Math.max(version, readVersion(raw));
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
    let currentVersion = readVersion(config);
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
        : currentVersion < (migration.version as number);
      if (!shouldRun) continue;

      const before = current;

      try {
        current = await migration.run(current, filePath, ctx);
        changed = true;
        appliedMigrations.push(migration.name);

        if (
          migration.version !== undefined &&
          migration.version > currentVersion
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

