import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { finalizeSchema, generateSettingsSchema } from "./schema-gen.mjs";

type JsonObject = Record<string, unknown>;

describe("finalizeSchema", () => {
  test("injects $schema and version into a $ref root definition", () => {
    const schema = {
      $ref: "#/definitions/MyConfig",
      definitions: {
        MyConfig: {
          type: "object",
          properties: { foo: { type: "string" } },
          additionalProperties: false,
        },
      },
    };

    const result = finalizeSchema(schema);

    const root = schema.definitions.MyConfig as Record<string, unknown>;
    const props = root.properties as Record<string, unknown>;
    expect(props.$schema).toEqual({ type: "string" });
    expect(props.version).toEqual({
      type: "number",
      description: "Config schema version, stamped by migrations.",
    });
    expect(root.additionalProperties).toBe(false);
    expect(result).toBe(schema);
  });

  test("injects into an inline root schema", () => {
    const schema: JsonObject = {
      type: "object",
      properties: { foo: { type: "string" } },
      additionalProperties: false,
    };

    finalizeSchema(schema);

    const props = schema.properties as JsonObject;
    expect(props.$schema).toEqual({ type: "string" });
    expect(props.version).toBeDefined();
    expect(schema.additionalProperties).toBe(false);
  });

  test("documents the current version when provided", () => {
    const schema: JsonObject = { type: "object", properties: {} };

    finalizeSchema(schema, { version: 3 });

    const props = schema.properties as JsonObject;
    expect(props.version).toEqual({
      type: "number",
      description:
        "Config schema version, stamped by migrations. Current version: 3.",
    });
  });

  test("is idempotent and overwrites stale reserved-key shapes", () => {
    const schema: JsonObject = {
      type: "object",
      properties: {
        foo: { type: "string" },
        version: { type: "string" },
      },
    };

    finalizeSchema(schema, { version: 1 });
    const afterFirst = JSON.parse(JSON.stringify(schema));
    finalizeSchema(schema, { version: 1 });

    expect(schema).toEqual(afterFirst);
    const props = schema.properties as JsonObject;
    // Source-type shapes for reserved keys are overwritten.
    expect(props.version).toEqual({
      type: "number",
      description:
        "Config schema version, stamped by migrations. Current version: 1.",
    });
    expect(props.foo).toEqual({ type: "string" });
  });
});

describe("generateSettingsSchema", () => {
  test("end-to-end generation against a fixture type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-settings-schema-"));
    try {
      const typePath = join(dir, "types.ts");
      const outPath = join(dir, "schema.json");
      writeFileSync(
        typePath,
        `export interface TestConfig {\n  enabled?: boolean;\n  paths?: string[];\n}\n`,
        "utf-8",
      );

      await generateSettingsSchema({
        path: typePath,
        type: "TestConfig",
        out: outPath,
      });

      const schema = JSON.parse(readFileSync(outPath, "utf-8"));
      const rootName = (schema.$ref as string).slice("#/definitions/".length);
      const root = schema.definitions[rootName];
      expect(root.properties.$schema).toEqual({ type: "string" });
      expect(root.properties.version.type).toBe("number");
      expect(root.properties.enabled).toEqual({ type: "boolean" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
