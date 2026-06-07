/**
 * Helpers for JSON Schema URL generation.
 *
 * Used to build `$schema` URLs pointing to schemas hosted on unpkg by default,
 * or on another public host via custom options.
 */

export interface BuildSchemaUrlOptions {
  /** Path to the schema file within the package or repository. */
  schemaPath?: string;
  /**
   * Base URL for hosts that follow the npm package URL shape:
   * `{baseUrl}/{packageName}@{version}/{schemaPath}`.
   *
   * Defaults to `https://unpkg.com`.
   */
  baseUrl?: string;
  /**
   * Full URL template for hosts with a custom URL shape.
   *
   * Supported placeholders: `{packageName}`, `{version}`, `{schemaPath}`.
   */
  template?: string;
}

/**
 * Build a URL to a JSON Schema file.
 *
 * By default, this builds an unpkg URL for an npm package. Use `baseUrl` for
 * npm-compatible public registries, or `template` for GitHub/raw URLs and other
 * hosts with a custom URL shape.
 *
 * @param packageName - npm package name or host-specific package/repository name
 * @param version - semver version, tag, branch, or host-specific version value
 * @param schemaPathOrOptions - schema path, or URL generation options
 * @returns Full URL to the schema file
 *
 * @example
 * ```ts
 * buildSchemaUrl("@aliou/pi-guardrails", "0.8.0");
 * // => "https://unpkg.com/@aliou/pi-guardrails@0.8.0/schema.json"
 *
 * buildSchemaUrl("aliou/pi-linear", "v1.0.0", {
 *   template: "https://raw.githubusercontent.com/{packageName}/{version}/{schemaPath}",
 * });
 * // => "https://raw.githubusercontent.com/aliou/pi-linear/v1.0.0/schema.json"
 * ```
 */
export function buildSchemaUrl(
  packageName: string,
  version: string,
  schemaPathOrOptions: string | BuildSchemaUrlOptions = "schema.json",
): string {
  const options =
    typeof schemaPathOrOptions === "string"
      ? { schemaPath: schemaPathOrOptions }
      : schemaPathOrOptions;
  const schemaPath = options.schemaPath ?? "schema.json";

  if (options.template) {
    return options.template
      .replaceAll("{packageName}", packageName)
      .replaceAll("{version}", version)
      .replaceAll("{schemaPath}", schemaPath);
  }

  const baseUrl = (options.baseUrl ?? "https://unpkg.com").replace(/\/+$/, "");
  return `${baseUrl}/${packageName}@${version}/${schemaPath}`;
}
