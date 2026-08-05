#!/usr/bin/env node

/**
 * pi-settings-schema — generate a JSON schema for a pi extension config type.
 *
 * Wraps ts-json-schema-generator and injects the reserved `$schema` and
 * `version` properties so consumers don't need them on their config type.
 */

import { generateSettingsSchema } from "../src/schema-gen.mjs";

const USAGE = `Usage: pi-settings-schema -p <file> -t <type> -o <file> [options]

Options:
  -p, --path <file>        TS source file containing the type
  -t, --type <name>        Root type/interface name
  -o, --out <file>         Output schema file
      --tsconfig <path>    tsconfig path
      --version <version>  Current migration version: non-negative integer or
                           semver string (documented in schema)
      --check              Verify the committed schema is current (exit 1 on drift)
      --no-skip-type-check Run the generator's type check (skipped by default)
  -h, --help               Show this help
`;

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };
    switch (arg) {
      case "-p":
      case "--path":
        options.path = next();
        break;
      case "-t":
      case "--type":
        options.type = next();
        break;
      case "-o":
      case "--out":
        options.out = next();
        break;
      case "--tsconfig":
        options.tsconfig = next();
        break;
      case "--version": {
        const raw = next();
        if (/^\d{1,15}(\.\d{1,15})?(\.\d{1,15})?$/.test(raw)) {
          // Dotted forms are semver strings; a bare integer stays a number
          // to match the stamped value of integer-scheme migrations.
          options.version = raw.includes(".") ? raw : Number(raw);
        } else {
          throw new Error(
            `--version must be a non-negative integer or a semver string, got "${raw}"`,
          );
        }
        break;
      }
      case "--check":
        options.check = true;
        break;
      case "--no-skip-type-check":
        options.skipTypeCheck = false;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n`);
    console.error(USAGE);
    process.exit(2);
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const missing = ["path", "type", "out"].filter((key) => !options[key]);
  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.map((k) => `--${k}`).join(", ")}\n`);
    console.error(USAGE);
    process.exit(2);
  }

  try {
    const { changed } = await generateSettingsSchema(options);
    if (options.check) {
      if (changed) {
        console.error(
          `${options.out} is out of date. Regenerate with:\n  pi-settings-schema -p ${options.path} -t ${options.type} -o ${options.out}`,
        );
        process.exit(1);
      }
      console.log(`${options.out} is up to date.`);
    } else {
      console.log(`Wrote ${options.out}`);
    }
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND") {
      console.error(
        "ts-json-schema-generator is required. Install it as a devDependency.",
      );
      process.exit(1);
    }
    console.error(`pi-settings-schema failed: ${error.message ?? error}`);
    process.exit(1);
  }
}

await main();
