/**
 * Type declarations for schema-gen.mjs (plain-JS schema generation core).
 */

export interface FinalizeSchemaOptions {
  /** Current migration version, documented in the `version` property. */
  version?: number | string;
}

/**
 * Inject the reserved `$schema` and `version` properties into the root
 * definition of a schema produced by ts-json-schema-generator.
 */
export function finalizeSchema(
  schema: Record<string, unknown>,
  options?: FinalizeSchemaOptions,
): Record<string, unknown>;

export interface GenerateSchemaOptions {
  /** TS source file containing the type. */
  path: string;
  /** Root type/interface name. */
  type: string;
  /** Output schema file. */
  out: string;
  /** tsconfig path. */
  tsconfig?: string;
  /** Current migration version to document in the schema. */
  version?: number | string;
  /** Verify the committed schema is current instead of writing. */
  check?: boolean;
  /** Skip the generator's type check. Default true. */
  skipTypeCheck?: boolean;
  /** Extra options passed through to ts-json-schema-generator. */
  extra?: Record<string, unknown>;
}

export interface GenerateSchemaResult {
  /** In check mode: true when the committed schema differs. */
  changed: boolean;
  schema: Record<string, unknown>;
}

/** Generate a JSON schema for a config type and inject reserved properties. */
export function generateSettingsSchema(
  options: GenerateSchemaOptions,
): Promise<GenerateSchemaResult>;
