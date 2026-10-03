/**
 * Schema generation core for pi-settings-schema.
 *
 * Plain ESM (no TypeScript syntax) so the CLI bin can run without a loader.
 * Types live in schema-gen.d.mts; index.ts re-exports from there.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Placeholder resolved against the consumer's installed peer dependency. */
const GENERATOR_PACKAGE = "ts-json-schema-generator";

/** Semver core pattern, matching the loader's accepted version strings. */
const SEMVER_PATTERN_SOURCE = "^\\d{1,15}(\\.\\d{1,15})?(\\.\\d{1,15})?$";

/**
 * Inject the reserved `$schema` and `version` properties into the root
 * definition of a schema produced by ts-json-schema-generator.
 *
 * The `version` property accepts a non-negative integer or a semver
 * string, matching the values ConfigLoader migrations can stamp.
 *
 * @param {Record<string, any>} schema
 * @param {{ version?: number | string }} [options]
 * @returns {Record<string, any>}
 */
export function finalizeSchema(schema, options = {}) {
  const root = resolveRootDefinition(schema);

  const description =
    options.version !== undefined
      ? `Config schema version, stamped by migrations. Current version: ${options.version}.`
      : "Config schema version, stamped by migrations.";

  root.properties ??= {};
  // Reserved keys are owned by the loader: overwrite any source-type shape.
  root.properties.$schema = { type: "string" };
  root.properties.version = {
    anyOf: [
      { type: "integer", minimum: 0 },
      { type: "string", pattern: SEMVER_PATTERN_SOURCE },
    ],
    description,
  };

  return schema;
}

function resolveRootDefinition(schema) {
  const ref = schema?.$ref;
  if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
    const name = ref.slice("#/definitions/".length);
    const def = schema.definitions?.[name];
    if (def && typeof def === "object") return def;
  }
  return schema;
}

/**
 * Generate a JSON schema for a config type and inject reserved properties.
 *
 * @param {object} options
 * @param {string} options.path TS source file containing the type
 * @param {string} options.type Root type/interface name
 * @param {string} options.out Output schema file
 * @param {string} [options.tsconfig] tsconfig path
 * @param {number | string} [options.version] Current migration version to document
 * @param {boolean} [options.check] Verify the committed schema is current
 * @param {boolean} [options.skipTypeCheck] Default true
 * @param {Record<string, any>} [options.extra] Extra generator config
 * @returns {Promise<{ changed: boolean, schema: Record<string, any> }>}
 */
export async function generateSettingsSchema(options) {
  const {
    path,
    type,
    out,
    tsconfig,
    version,
    check = false,
    skipTypeCheck = true,
    extra = {},
  } = options;

  const { createGenerator } = await import(GENERATOR_PACKAGE);

  const generator = createGenerator({
    path,
    type,
    tsconfig,
    skipTypeCheck,
    ...extra,
  });
  const schema = finalizeSchema(generator.createSchema(type), { version });

  const output = `${JSON.stringify(schema, null, 2)}\n`;

  if (check) {
    const committed = existsSync(out) ? readFileSync(out, "utf-8") : null;
    return { changed: committed !== output, schema };
  }

  writeFileSync(out, output, "utf-8");
  return { changed: true, schema };
}
