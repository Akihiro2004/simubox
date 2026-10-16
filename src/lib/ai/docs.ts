// Compact, always-in-sync command reference for the system prompt,
// generated from the same Zod schema that validates the model's output.

import { z } from "zod";
import { Command } from "../ssp/schema";

type J = Record<string, unknown> & {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, J>;
  required?: string[];
  items?: J;
  anyOf?: J[];
  oneOf?: J[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
};

function fmt(s: J): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.length > 24 ? `id from the ${s.enum.length}-item list below` : s.enum.map((v) => JSON.stringify(v)).join("|");
  const alts = s.anyOf ?? s.oneOf;
  if (alts) return alts.map(fmt).join(" or ");
  switch (s.type) {
    case "string":
      if (s.pattern?.startsWith("^#")) return `"#rrggbb"`;
      if (s.pattern?.startsWith("^[a-z]")) return "id";
      return s.maxLength ? `text≤${s.maxLength}` : "text";
    case "number":
    case "integer": {
      const t = s.type === "integer" ? "int" : "num";
      return s.minimum !== undefined && s.maximum !== undefined ? `${t} ${s.minimum}..${s.maximum}` : t;
    }
    case "boolean":
      return "true|false";
    case "array": {
      const it = s.items ?? {};
      if ((it.type === "number" || it.type === "integer") && s.minItems === 3 && s.maxItems === 3) return `[x,y,z]${it.maximum !== undefined ? ` ±${it.maximum}` : ""}`;
      if ((it.type === "number" || it.type === "integer") && s.minItems === 2 && s.maxItems === 2) return "[x,y]";
      const n = s.maxItems ? ` (max ${s.maxItems})` : "";
      return `[${fmt(it)}, …]${n}`;
    }
    case "object": {
      const req = new Set(s.required ?? []);
      const parts = Object.entries(s.properties ?? {}).map(([k, v]) => `${k}${req.has(k) ? "" : "?"}: ${fmt(v)}`);
      return `{${parts.join(", ")}}`;
    }
  }
  return "any";
}

// Explained once in the prompt header, so not repeated on every line.
const GENERIC = ["snake_case id", "[x, y, z] in meters", "hex color", "dynamic = falls"];

let cached: string | null = null;

/** One line per command: op, fields (? = optional) and field notes. */
export function commandReference(): string {
  if (cached) return cached;
  const json = z.toJSONSchema(Command, { target: "draft-2020-12", unrepresentable: "any" }) as J;
  const variants = (json.oneOf ?? json.anyOf ?? []) as J[];
  cached = variants
    .map((v) => {
      const props = { ...(v.properties ?? {}) };
      const op = (props.op?.const ?? props.op?.enum?.[0]) as string;
      delete props.op;
      const req = new Set(v.required ?? []);
      const fields = Object.entries(props).map(([k, p]) => `${k}${req.has(k) ? "" : "?"}: ${fmt(p)}`);
      const notes = Object.entries(props)
        .filter(([, p]) => p.description && !GENERIC.some((g) => p.description!.startsWith(g)))
        .map(([k, p]) => `${k}: ${p.description}`);
      return `- ${op} {${fields.join(", ")}}${notes.length ? `  // ${notes.join("; ")}` : ""}`;
    })
    .join("\n");
  return cached;
}
