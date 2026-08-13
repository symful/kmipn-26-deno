import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BINDINGS_PATH = resolve(process.cwd(), "src/types/bindings.ts");
const ENV_EXAMPLE_PATH = resolve(process.cwd(), ".env.example");

function parseBindings(path: string): Set<string> {
  const content = readFileSync(path, "utf-8");
  const envVars = new Set<string>();

  const interfaceMatch = content.match(/export interface Env \{([^}]*)\}/s);
  if (!interfaceMatch) {
    console.error("Could not find Env interface in bindings.ts");
    process.exit(1);
  }

  const interfaceBody = interfaceMatch[1]!;
  const propertyRegex = /^\s*(\w+)(?:\?)?:\s*\S+/gm;
  let match;
  while ((match = propertyRegex.exec(interfaceBody)) !== null) {
    envVars.add(match[1]!);
  }

  return envVars;
}

function parseEnvExample(path: string): Set<string> {
  const content = readFileSync(path, "utf-8");
  const envVars = new Set<string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/i);
    if (match) {
      envVars.add(match[1]!);
    }
  }

  return envVars;
}

function main() {
  const bindings = parseBindings(BINDINGS_PATH);
  const envExample = parseEnvExample(ENV_EXAMPLE_PATH);

  let hasError = false;

  const missingFromEnvExample = [...bindings].filter((v) => !envExample.has(v));
  if (missingFromEnvExample.length > 0) {
    hasError = true;
    console.error("ERROR: Env vars defined in bindings.ts but missing from .env.example:");
    for (const v of missingFromEnvExample.sort()) {
      console.error(`  - ${v}`);
    }
  }

  const notInBindings = [...envExample].filter((v) => !bindings.has(v));
  if (notInBindings.length > 0) {
    console.warn("WARNING: Env vars in .env.example not found in bindings.ts (Cloudflare bindings?):");
    for (const v of notInBindings.sort()) {
      console.warn(`  - ${v}`);
    }
  }

  if (!hasError) {
    console.log("All env vars from bindings.ts are documented in .env.example");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
