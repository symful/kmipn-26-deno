import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OPENAPI_PATH = resolve(ROOT, "contracts/openapi.yaml");
const TS_OUT = resolve(ROOT, "contracts/types.ts");
const FLUTTER_OUT = resolve(ROOT, "../kmipn-26-flutter/lib/api/types.g.dart");

const raw = readFileSync(OPENAPI_PATH, "utf-8");
const doc = yaml.load(raw) as Record<string, unknown>;
const schemas = (doc["components"] as Record<string, unknown>)["schemas"] as Record<string, unknown>;

function tsTypeName(name: string): string {
  return name.replace(/^./, (c) => c.toUpperCase()).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function tsType(schema: Record<string, unknown>, depth = 0): string {
  const type = schema["type"] as string | undefined;
  const ref = schema["$ref"] as string | undefined;
  const enums = schema["enum"] as string[] | undefined;
  const fmt = schema["format"] as string | undefined;

  if (ref) return tsTypeName(ref.split("/").pop()!);
  if (enums) return enums.map((v) => JSON.stringify(v)).join(" | ");

  if (type === "object") {
    const props = schema["properties"] as Record<string, unknown> | undefined;
    if (props && Object.keys(props).length > 0) {
      if (depth > 3) return "Record<string, unknown>";
      const entries = Object.entries(props).map(([k, v]) => {
        const p = v as Record<string, unknown>;
        const req = (schema["required"] as string[] ?? []).includes(k);
        const nullable = !req;
        return `  ${k}${nullable ? "?" : ""}: ${tsType(p, depth + 1)};`;
      });
      return `{\n${entries.join("\n")}\n}`;
    }
    return "Record<string, unknown>";
  }

  if (type === "array") {
    const items = schema["items"] as Record<string, unknown>;
    return `${tsType(items, depth + 1)}[]`;
  }

  if (type === "integer") return "number";
  if (type === "number") return "number";
  if (type === "string") {
    if (fmt === "date-time") return "string";
    return "string";
  }
  if (type === "boolean") return "boolean";

  return "unknown";
}

function generateTs(): string {
  const lines: string[] = [];

  for (const [name, schema] of Object.entries(schemas)) {
    const s = schema as Record<string, unknown>;
    const required = (s["required"] as string[]) ?? [];
    const enums = s["enum"] as string[] | undefined;
    const type = s["type"] as string | undefined;

    if (enums) {
      lines.push(`export type ${tsTypeName(name)} = ${enums.map((v) => JSON.stringify(v)).join(" | ")};`);
    } else if (type === "object") {
      const props = s["properties"] as Record<string, unknown>;
      lines.push(`export interface ${tsTypeName(name)} {`);
      for (const [k, v] of Object.entries(props ?? {})) {
        const p = v as Record<string, unknown>;
        const req = required.includes(k);
        const nullable = !req;
        lines.push(`  ${k}${nullable ? "?" : ""}: ${tsType(p)};`);
      }
      lines.push("}");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function dartTypeName(name: string): string {
  return name.replace(/^./, (c) => c.toUpperCase()).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function dartType(schema: Record<string, unknown>, nullable: boolean): string {
  const type = schema["type"] as string | undefined;
  const ref = schema["$ref"] as string | undefined;
  const enums = schema["enum"] as string[] | undefined;
  const fmt = schema["format"] as string | undefined;

  if (ref) return dartTypeName(ref.split("/").pop()!);
  if (enums) return "String";

  if (type === "object") return "Map<String, dynamic>";
  if (type === "array") {
    const items = schema["items"] as Record<string, unknown>;
    return `List<${dartType(items as Record<string, unknown>, false)}>`;
  }
  if (type === "integer") return "int";
  if (type === "number") return "double";
  if (type === "string") {
    if (fmt === "date-time") return "DateTime";
    return "String";
  }
  if (type === "boolean") return "bool";

  return "dynamic";
}

function dartFieldName(jsonKey: string): string {
  return jsonKey.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function isRefEnum(refName: string): boolean {
  const refSchema = schemas[refName] as Record<string, unknown>;
  return refSchema != null && Array.isArray(refSchema["enum"]);
}

function generateNestedArrayCast(items: Record<string, unknown>, depth: number, topLevel: boolean): string {
  const itemType = items["type"] as string | undefined;
  const itemRef = items["$ref"] as string | undefined;
  const itemItems = items["items"] as Record<string, unknown> | undefined;

  if (itemRef) {
    const refName = dartTypeName(itemRef.split("/").pop()!);
    const isEnum = isRefEnum(refName);
    if (isEnum) {
      return `${refName}.fromJson(e as String)`;
    } else {
      return `${refName}.fromJson(e as Map<String, dynamic>)`;
    }
  }

  if (itemType === "array" && itemItems) {
    const inner = generateNestedArrayCast(itemItems, depth + 1, false);
    const op = topLevel ? "?." : ".";
    return `(e as List)${op}map((e) => ${inner}).toList()`;
  }

  if (itemType === "string") return "e as String";
  if (itemType === "integer") return "e as int";
  if (itemType === "number") return "(e as num).toDouble()";
  if (itemType === "boolean") return "e as bool";
  return "e as Map<String, dynamic>";
}

function generateDart(): string {
  const lines: string[] = [];
  lines.push("// AUTO-GENERATED by scripts/codegen.ts — edits will be overwritten");
  lines.push("");

  for (const [name, schema] of Object.entries(schemas)) {
    const s = schema as Record<string, unknown>;
    const required = (s["required"] as string[]) ?? [];
    const type = s["type"] as string | undefined;
    const enums = s["enum"] as string[] | undefined;
    const props = s["properties"] as Record<string, unknown> | undefined;

    if (enums) {
      const className = dartTypeName(name);
      lines.push(`enum ${className} {`);
      const memberNames: string[] = [];
      for (let i = 0; i < enums.length; i++) {
        const v = enums[i];
        const memberName = v?.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        memberNames.push(`${className}.${memberName}`);
        lines.push(`  ${memberName}(${JSON.stringify(v)})${i === enums.length - 1 ? ";" : ","}`);
      }
      lines.push("  final String value;");
      lines.push(`  const ${className}(this.value);`);
      lines.push(`  static const allValues = <${className}>[${memberNames.join(", ")}];`);
      lines.push(`  static ${className} fromJson(String value) => allValues.firstWhere((e) => e.value == value);`);
      lines.push("}");
      lines.push("");
      continue;
    }

    if (type === "object" && props) {
      const className = dartTypeName(name);
      lines.push(`class ${className} {`);
      for (const [k, v] of Object.entries(props)) {
        const p = v as Record<string, unknown>;
        const isRequired = required.includes(k);
        const nullable = !isRequired;
        const dartTypeStr = dartType(p, nullable);
        const dartName = dartFieldName(k);
        lines.push(`  final ${dartTypeStr}${nullable ? "?" : ""} ${dartName};`);
      }

      const params = Object.entries(props).map(([k, v]) => {
        const p = v as Record<string, unknown>;
        const isRequired = required.includes(k);
        const dartName = dartFieldName(k);
        return `${isRequired ? "required " : ""}this.${dartName}`;
      });
      lines.push(`  ${className}({${params.join(", ")}});`);
      lines.push("");
      lines.push(`  factory ${className}.fromJson(Map<String, dynamic> json) {`);
      lines.push(`    return ${className}(`);
      for (const [k, v] of Object.entries(props)) {
        const p = v as Record<string, unknown>;
        const isRequired = required.includes(k);
        const nullable = !isRequired;
        const dartName = dartFieldName(k);
        const ref = p["$ref"] as string | undefined;
        const t = p["type"] as string | undefined;
        const fmt = p["format"] as string | undefined;

        if (ref) {
          const refName = dartTypeName(ref.split("/").pop()!);
          const isEnum = isRefEnum(refName);
          if (isEnum) {
            if (nullable) {
              lines.push(`      ${dartName}: json['${k}'] != null ? ${refName}.fromJson(json['${k}'] as String) : null,`);
            } else {
              lines.push(`      ${dartName}: ${refName}.fromJson(json['${k}'] as String),`);
            }
          } else {
            if (nullable) {
              lines.push(`      ${dartName}: json['${k}'] != null ? ${refName}.fromJson(json['${k}'] as Map<String, dynamic>) : null,`);
            } else {
              lines.push(`      ${dartName}: ${refName}.fromJson(json['${k}'] as Map<String, dynamic>),`);
            }
          }
        } else if (t === "integer") {
          lines.push(`      ${dartName}: json['${k}'] as int${nullable ? "?" : ""},`);
        } else if (t === "number") {
          if (nullable) {
            lines.push(`      ${dartName}: (json['${k}'] as num?)?.toDouble(),`);
          } else {
            lines.push(`      ${dartName}: (json['${k}'] as num).toDouble(),`);
          }
        } else if (t === "boolean") {
          lines.push(`      ${dartName}: json['${k}'] as bool${nullable ? "?" : ""},`);
        } else if (t === "array") {
          const items = p["items"] as Record<string, unknown>;
          const itemRef = items["$ref"] as string | undefined;
          const itemType = items["type"] as string | undefined;
          let itemCast: string;

          if (itemRef) {
            const refName = dartTypeName(itemRef.split("/").pop()!);
            const isEnum = isRefEnum(refName);
            if (isEnum) {
              itemCast = `${refName}.fromJson(e as String)`;
            } else {
              itemCast = `${refName}.fromJson(e as Map<String, dynamic>)`;
            }
          } else if (itemType === "array") {
            itemCast = generateNestedArrayCast(items, 1, nullable);
          } else if (itemType === "string") {
            itemCast = "e as String";
          } else if (itemType === "integer") {
            itemCast = "e as int";
          } else if (itemType === "number") {
            itemCast = "(e as num).toDouble()";
          } else {
            itemCast = "e as Map<String, dynamic>";
          }

          if (nullable) {
            lines.push(`      ${dartName}: (json['${k}'] as List?)?.map((e) => ${itemCast}).toList(),`);
          } else {
            lines.push(`      ${dartName}: (json['${k}'] as List?)?.map((e) => ${itemCast}).toList() ?? [],`);
          }
        } else if (fmt === "date-time") {
          if (nullable) {
            lines.push(`      ${dartName}: json['${k}'] != null ? DateTime.parse(json['${k}'] as String) : null,`);
          } else {
            lines.push(`      ${dartName}: DateTime.parse(json['${k}'] as String),`);
          }
        } else if (t === "object" || p["properties"]) {
          lines.push(`      ${dartName}: json['${k}'] as Map<String, dynamic>${nullable ? "?" : ""},`);
        } else {
          lines.push(`      ${dartName}: json['${k}'] as String${nullable ? "?" : ""},`);
        }
      }
      lines.push(`    );`);
      lines.push(`  }`);
      lines.push("");
      lines.push(`  Map<String, dynamic> toJson() {`);
      lines.push(`    return {`);
      for (const [k, v] of Object.entries(props)) {
        const dartName = dartFieldName(k);
        const p = v as Record<string, unknown>;
        const isRequired = required.includes(k);
        const nullable = !isRequired;
        const ref = p["$ref"] as string | undefined;
        const fmt = p["format"] as string | undefined;
        if (ref) {
          const refName = dartTypeName(ref.split("/").pop()!);
          const isEnum = isRefEnum(refName);
          if (isEnum) {
            lines.push(`      '${k}': ${dartName}${nullable ? "?" : ""}.value,`);
          } else {
            lines.push(`      '${k}': ${dartName}${nullable ? "?" : ""}.toJson(),`);
          }
        } else if (fmt === "date-time") {
          lines.push(`      '${k}': ${dartName}${nullable ? "?" : ""}.toIso8601String(),`);
        } else if (p["type"] === "object" || p["properties"]) {
          lines.push(`      '${k}': ${dartName},`);
        } else {
          lines.push(`      '${k}': ${dartName},`);
        }
      }
      lines.push(`    };`);
      lines.push(`  }`);
      lines.push("}");
      lines.push("");
    }
  }

  return lines.join("\n");
}

const tsOut = generateTs();
writeFileSync(TS_OUT, tsOut, "utf-8");
console.log("Generated TypeScript types →", TS_OUT, `(${tsOut.split("\n").length} lines)`);

const dartOut = generateDart();
writeFileSync(FLUTTER_OUT, dartOut, "utf-8");
console.log("Generated Dart types →", FLUTTER_OUT, `(${dartOut.split("\n").length} lines)`);
