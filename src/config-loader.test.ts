import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, test as baseTest, describe, expect, vi } from "vitest";
import {
  ConfigLoader,
  createConfigStore,
  type MigrationContext,
} from "./config-loader";

// --- Test types ---

interface TestConfig {
  version?: number;
  foo?: string;
  bar?: number;
  legacy?: boolean;
}

interface TestResolved {
  version: number;
  foo: string;
  bar: number;
  legacy: boolean;
}

const DEFAULTS: TestResolved = {
  version: 0,
  foo: "",
  bar: 0,
  legacy: false,
};

// --- Fixtures ---

const test = baseTest.extend<{
  testDir: string;
  addGlobalConfig: (name: string, config: TestConfig) => string;
}>({
  testDir: async ({ task }, use) => {
    const safeName = task.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const tmp = mkdtempSync(join(tmpdir(), `pi-utils-settings-${safeName}-`));

    await use(tmp);

    rmSync(tmp, { recursive: true, force: true });
  },

  addGlobalConfig: async ({ testDir }, use) => {
    await use((name, config) => {
      const extDir = join(testDir, "extensions");
      mkdirSync(extDir, { recursive: true });
      const path = join(extDir, `${name}.json`);
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
      return path;
    });
  },
});

// Mock getAgentDir to return our fixture-provided testDir
let currentTestDir = "";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  getAgentDir: () => currentTestDir,
}));

// --- Tests ---

describe("ConfigLoader migration messages", () => {
  const configName = "pi-utils-settings-test-msgs";

  test("queues a static message when migration runs", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { legacy: true });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "remove-legacy",
            shouldRun: (c) => c.legacy === true,
            message: "[test] legacy field has been removed from config.",
            run: (c) => {
              const { legacy, ...rest } = c as TestConfig & {
                legacy: boolean;
              };
              return rest as TestConfig;
            },
          },
        ],
      },
    );

    await loader.load();

    const messages = loader.drainMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(
      "[test] legacy field has been removed from config.",
    );

    // Draining again returns empty
    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("queues a dynamic message from a factory function", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "old-value" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "rename-foo",
            shouldRun: (c) => c.foo === "old-value",
            message: (before, after) =>
              `Config migrated: foo was "${before.foo}", now "${after.foo}".`,
            run: (c) => ({ ...c, foo: "new-foo" }),
          },
        ],
      },
    );

    await loader.load();

    const messages = loader.drainMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(
      'Config migrated: foo was "old-value", now "new-foo".',
    );
  });

  test("skips message when factory function returns undefined", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "some-value" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "conditional-msg",
            shouldRun: (c) => c.foo !== undefined,
            message: (before) =>
              before.foo === "special" ? "Special warning" : undefined,
            run: (c) => c,
          },
        ],
      },
    );

    await loader.load();

    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("does not queue message when migration fails", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "trigger" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "failing-migration",
            shouldRun: (c) => c.foo === "trigger",
            message: "This should not appear",
            run: () => {
              throw new Error("migration exploded");
            },
          },
        ],
      },
    );

    await loader.load();

    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("does not queue message when shouldRun returns false", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "skip" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "never-runs",
            shouldRun: () => false,
            message: "Should not appear",
            run: (c) => c,
          },
        ],
      },
    );

    await loader.load();

    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("queues messages from multiple migrations", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "old", legacy: true });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "rename-foo",
            shouldRun: (c) => c.foo === "old",
            message: "Foo was renamed",
            run: (c) => ({ ...c, foo: "new" }),
          },
          {
            name: "remove-legacy",
            shouldRun: (c) => c.legacy === true,
            message: "Legacy was removed",
            run: (c) => {
              const { legacy, ...rest } = c as TestConfig & {
                legacy: boolean;
              };
              return rest as TestConfig;
            },
          },
        ],
      },
    );

    await loader.load();

    const messages = loader.drainMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe("Foo was renamed");
    expect(messages[1]).toBe("Legacy was removed");
  });

  test("message factory receives before and after config", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "before-run" });

    let receivedBefore: TestConfig | undefined;
    let receivedAfter: TestConfig | undefined;

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "transform-foo",
            shouldRun: (c) => c.foo === "before-run",
            message: (before, after) => {
              receivedBefore = before;
              receivedAfter = after;
              return `Changed foo from "${before.foo}" to "${after.foo}"`;
            },
            run: (c) => ({ ...c, foo: "after-run" }),
          },
        ],
      },
    );

    await loader.load();

    assert(receivedBefore, "before config should be captured");
    assert(receivedAfter, "after config should be captured");
    expect(receivedBefore.foo).toBe("before-run");
    expect(receivedAfter.foo).toBe("after-run");

    const messages = loader.drainMessages();
    expect(messages[0]).toBe('Changed foo from "before-run" to "after-run"');
  });

  test("gracefully handles message factory that throws", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "trigger" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "bad-message-factory",
            shouldRun: (c) => c.foo === "trigger",
            message: () => {
              throw new Error("message factory exploded");
            },
            run: (c) => ({ ...c, foo: "migrated" }),
          },
        ],
      },
    );

    await loader.load();

    // Migration still succeeded, message just not queued
    expect(loader.getConfig().foo).toBe("migrated");
    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("migration without message field works as before", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "no-message-migration",
            shouldRun: (c) => c.foo === "old",
            run: (c) => ({ ...c, foo: "new" }),
          },
        ],
      },
    );

    await loader.load();

    expect(loader.getConfig().foo).toBe("new");
    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("accumulates messages across load() calls", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "first" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "migrate-foo",
            shouldRun: (c) => c.foo === "first",
            message: "First migration ran",
            run: (c) => ({ ...c, foo: "second" }),
          },
        ],
      },
    );

    await loader.load();
    expect(loader.drainMessages()).toHaveLength(1);

    // Second load — config was already migrated, shouldRun returns false
    await loader.load();
    expect(loader.drainMessages()).toHaveLength(0);
  });

  test("static message is used as-is when message is a string", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "trigger" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "static-msg",
            shouldRun: (c) => c.foo === "trigger",
            message: "Static message text",
            run: (c) => ({ ...c, foo: "done" }),
          },
        ],
      },
    );

    await loader.load();

    expect(loader.drainMessages()).toEqual(["Static message text"]);
  });
});

describe("ConfigLoader versioned migrations", () => {
  const configName = "pi-utils-settings-test-versions";

  test("throws when a migration has neither shouldRun nor version", async ({
    testDir,
  }) => {
    currentTestDir = testDir;

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            {
              name: "invalid",
              run: (c) => c,
            },
          ],
        }),
    ).toThrow(/needs shouldRun or version/);
  });

  test("throws on non-integer or non-monotonic versions", async ({
    testDir,
  }) => {
    currentTestDir = testDir;

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [{ name: "bad", version: 1.5, run: (c) => c }],
        }),
    ).toThrow(/non-negative integer/);

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            { name: "v2", version: 2, run: (c) => c },
            { name: "v1", version: 1, run: (c) => c },
          ],
        }),
    ).toThrow(/must be greater than the previous/);
  });

  test("stops the chain when a versioned migration fails", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    const path = addGlobalConfig(configName, {});

    const v2Run = vi.fn((c: TestConfig) => c);

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: 1,
            run: () => {
              throw new Error("v1 exploded");
            },
          },
          { name: "v2", version: 2, run: v2Run },
        ],
      },
    );

    await loader.load();

    // v2 must not run: otherwise it would stamp version 2 and v1 would be
    // permanently skipped on subsequent loads.
    expect(v2Run).not.toHaveBeenCalled();
    expect(loader.getVersion()).toBe(0);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.version).toBeUndefined();
  });

  test("default gate uses tracked version even if a migration drops the field", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, {});

    const v2Run = vi.fn((c: TestConfig) => c);

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: 1,
            // Returns a config without the stamped version field.
            run: (c) => {
              const { version: _, ...rest } = c;
              return rest;
            },
          },
          { name: "v2", version: 2, run: v2Run },
        ],
      },
    );

    await loader.load();

    expect(v2Run).toHaveBeenCalledTimes(1);
    expect(loader.getVersion()).toBe(2);
  });

  test("versioned migration stamps the config file", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    const path = addGlobalConfig(configName, { foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: 1,
            run: (c) => ({ ...c, foo: "new" }),
          },
        ],
      },
    );

    await loader.load();

    expect(loader.getRawConfig("global")?.version).toBe(1);
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.version).toBe(1);
    expect(onDisk.foo).toBe("new");
  });

  test("default shouldRun runs below version and skips at/above", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: 2, foo: "old" });

    const run = vi.fn((c: TestConfig) => ({ ...c, foo: "new" }));

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          { name: "v1", version: 1, run },
          { name: "v2", version: 2, run },
        ],
      },
    );

    await loader.load();

    expect(run).not.toHaveBeenCalled();
    expect(loader.getRawConfig("global")?.foo).toBe("old");
  });

  test("explicit shouldRun overrides the version default", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: 5, foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "forced",
            version: 1,
            shouldRun: (c) => c.foo === "old",
            run: (c) => ({ ...c, foo: "new" }),
          },
        ],
      },
    );

    await loader.load();

    expect(loader.getRawConfig("global")?.foo).toBe("new");
    // Version 5 is already higher than the migration's version: no re-stamp.
    expect(loader.getRawConfig("global")?.version).toBe(5);
  });

  test("context accumulates applied migrations and versions across the chain", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, {});

    const contexts: MigrationContext[] = [];

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: 1,
            run: (c, _p, ctx) => {
              contexts.push({
                ...ctx,
                appliedMigrations: [...ctx.appliedMigrations],
              });
              return c;
            },
          },
          {
            name: "v2",
            version: 2,
            run: (c, _p, ctx) => {
              contexts.push({
                ...ctx,
                appliedMigrations: [...ctx.appliedMigrations],
              });
              return c;
            },
          },
        ],
      },
    );

    await loader.load();

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toMatchObject({
      fromVersion: 0,
      toVersion: 1,
      appliedMigrations: [],
    });
    expect(contexts[1]).toMatchObject({
      fromVersion: 1,
      toVersion: 2,
      appliedMigrations: ["v1"],
    });
    expect(loader.getVersion()).toBe(2);
  });

  test("migrations without version do not stamp the file", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    const path = addGlobalConfig(configName, { foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "unversioned",
            shouldRun: (c) => c.foo === "old",
            run: (c) => ({ ...c, foo: "new" }),
          },
        ],
      },
    );

    await loader.load();

    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.foo).toBe("new");
    expect(onDisk.version).toBeUndefined();
    expect(loader.getVersion()).toBe(0);
  });

  test("message factory receives the migration context", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, {});

    let received: MigrationContext | undefined;

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v3",
            version: 3,
            message: (_before, _after, _path, ctx) => {
              received = ctx;
              return "migrated";
            },
            run: (c) => c,
          },
        ],
      },
    );

    await loader.load();

    assert(received, "context should be passed to the message factory");
    expect(received.toVersion).toBe(3);
    expect(received.fromVersion).toBe(0);
    expect(loader.drainMessages()).toEqual(["migrated"]);
  });

  test("version stamping coerces a string version from disk", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, {
      version: "1" as unknown as number,
      foo: "old",
    });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          { name: "v1", version: 1, run: (c) => ({ ...c, foo: "new" }) },
        ],
      },
    );

    await loader.load();

    // "1" is not below 1: the migration is skipped.
    expect(loader.getRawConfig("global")?.foo).toBe("old");
    expect(loader.getVersion()).toBe(1);
  });

  test("does not stamp the file when the only versioned migration fails", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    const path = addGlobalConfig(configName, { foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: 1,
            run: () => {
              throw new Error("exploded");
            },
          },
        ],
      },
    );

    await loader.load();

    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.foo).toBe("old");
    expect(onDisk.version).toBeUndefined();
  });
});

describe("ConfigLoader semver migrations", () => {
  const configName = "pi-utils-settings-test-semver";

  test("throws on invalid semver versions", async ({ testDir }) => {
    currentTestDir = testDir;

    for (const version of ["1.0.0-beta", "1.0.0+build", "not-a-version"]) {
      expect(
        () =>
          new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
            migrations: [{ name: "bad", version, run: (c) => c }],
          }),
      ).toThrow(/semver string/);
    }
  });

  test("throws on non-monotonic semver versions", async ({ testDir }) => {
    currentTestDir = testDir;

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            { name: "v2", version: "2.0.0", run: (c) => c },
            { name: "v1", version: "1.10.0", run: (c) => c },
          ],
        }),
    ).toThrow(/must be greater than the previous/);

    // Equal versions are also rejected.
    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            { name: "v1", version: "1.2.0", run: (c) => c },
            { name: "v1-again", version: "1.2.0", run: (c) => c },
          ],
        }),
    ).toThrow(/must be greater than the previous/);
  });

  test("throws when mixing version schemes", async ({ testDir }) => {
    currentTestDir = testDir;

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            { name: "v1", version: 1, run: (c) => c },
            { name: "v2", version: "2.0.0", run: (c) => c },
          ],
        }),
    ).toThrow(/mixes version schemes/);

    expect(
      () =>
        new ConfigLoader<TestConfig, TestResolved>(configName, DEFAULTS, {
          migrations: [
            { name: "v1", version: "1.0.0", run: (c) => c },
            { name: "v2", version: 2, run: (c) => c },
          ],
        }),
    ).toThrow(/mixes version schemes/);
  });

  test("orders semver numerically, not lexically", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: "0.9.0" as never, foo: "old" });

    // "0.9.0" > "0.10.0" lexically, but 0.9.0 < 0.10.0 in semver order.
    const run = vi.fn((c: TestConfig) => ({ ...c, foo: "new" }));
    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [{ name: "v1", version: "0.10.0", run }],
      },
    );

    await loader.load();

    expect(run).toHaveBeenCalledTimes(1);
    expect(loader.getVersion()).toBe("0.10.0");
  });

  test("stamps a semver string on the config file", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    const path = addGlobalConfig(configName, { foo: "old" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          { name: "v1", version: "1.0.0", run: (c) => ({ ...c, foo: "a" }) },
          { name: "v2", version: "1.2.0", run: (c) => ({ ...c, foo: "b" }) },
        ],
      },
    );

    await loader.load();

    expect(loader.getRawConfig("global")?.version).toBe("1.2.0");
    expect(loader.getVersion()).toBe("1.2.0");
    const onDisk = JSON.parse(readFileSync(path, "utf-8"));
    expect(onDisk.version).toBe("1.2.0");
    expect(onDisk.foo).toBe("b");
  });

  test("default shouldRun runs below version and skips at/above", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: "1.2.0" as never, foo: "old" });

    const run = vi.fn((c: TestConfig) => c);
    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          { name: "v1", version: "1.0.0", run },
          { name: "v2", version: "1.2.0", run },
        ],
      },
    );

    await loader.load();

    // Config is at 1.2.0: both migrations skip (at or above their version).
    expect(run).not.toHaveBeenCalled();
    expect(loader.getVersion()).toBe("1.2.0");
  });

  test("accepts shorthand semver and treats missing parts as 0", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: "1.2" as never, foo: "old" });

    const run = vi.fn((c: TestConfig) => c);
    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [{ name: "v1", version: "1.2.0", run }],
      },
    );

    await loader.load();

    // "1.2" reads as 1.2.0, which is not below 1.2.0: skip.
    expect(run).not.toHaveBeenCalled();
    expect(loader.getVersion()).toBe("1.2");
  });

  test("reads a legacy integer stamp as its semver form", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: 0, foo: "old" });

    const run = vi.fn((c: TestConfig) => ({ ...c, foo: "new" }));
    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [{ name: "v1", version: "1.0.0", run }],
      },
    );

    await loader.load();

    // Legacy stamp 0 reads as 0.0.0, which is below 1.0.0: run and re-stamp.
    expect(run).toHaveBeenCalledTimes(1);
    expect(loader.getVersion()).toBe("1.0.0");
  });

  test("returns the scheme zero when no config exists", async ({ testDir }) => {
    currentTestDir = testDir;

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [{ name: "v1", version: "1.0.0", run: (c) => c }],
      },
    );

    await loader.load();

    expect(loader.getVersion()).toBe("0.0.0");
  });

  test("context reports semver fromVersion/toVersion", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { version: "1.0.0" as never, foo: "old" });

    let received: MigrationContext | undefined;
    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      {
        scopes: ["global"],
        migrations: [
          {
            name: "v1",
            version: "1.1.0",
            message: (_before, _after, _filePath, ctx) => {
              received = ctx;
              return "migrated";
            },
            run: (c) => ({ ...c, foo: "new" }),
          },
        ],
      },
    );

    await loader.load();

    assert(received, "context should be passed to the message factory");
    expect(received.fromVersion).toBe("1.0.0");
    expect(received.toVersion).toBe("1.1.0");
  });
});

describe("createConfigStore", () => {
  const configName = "pi-utils-settings-test-store";

  test("delegates to the loader and respects the scope filter", async ({
    testDir,
    addGlobalConfig,
  }) => {
    currentTestDir = testDir;
    addGlobalConfig(configName, { foo: "stored" });

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      { scopes: ["global", "local"] },
    );
    await loader.load();

    const store = createConfigStore(loader, { scopes: ["global"] });

    expect(store.getEnabledScopes()).toEqual(["global"]);
    expect(store.hasScope("local")).toBe(true);
    expect(store.hasConfig("global")).toBe(true);
    expect(store.getRawConfig("global")?.foo).toBe("stored");
    expect(store.getConfig().foo).toBe("stored");

    await store.save("global", { foo: "updated" });
    expect(loader.getRawConfig("global")?.foo).toBe("updated");
  });

  test("defaults to the loader's enabled scopes", async ({ testDir }) => {
    currentTestDir = testDir;

    const loader = new ConfigLoader<TestConfig, TestResolved>(
      configName,
      DEFAULTS,
      { scopes: ["global", "memory"] },
    );
    await loader.load();

    const store = createConfigStore(loader);
    expect(store.getEnabledScopes()).toEqual(["global", "memory"]);
  });
});
