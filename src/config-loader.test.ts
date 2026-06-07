import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, test as baseTest, describe, expect, vi } from "vitest";
import { ConfigLoader } from "./config-loader";

// --- Test types ---

interface TestConfig {
  version?: string;
  foo?: string;
  bar?: number;
  legacy?: boolean;
}

interface TestResolved {
  version: string;
  foo: string;
  bar: number;
  legacy: boolean;
}

const DEFAULTS: TestResolved = {
  version: "",
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
