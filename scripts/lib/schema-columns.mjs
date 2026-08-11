/**
 * Shared core for the schema-vs-code column guard (post-cleanup item 2).
 *
 * Two halves, both dependency-free and DB-free:
 *   • parseSchema()  — the committed migrations → Map(table → Set(columns)).
 *   • columnsWritten() — a static scan of the app's `.from("t").insert/update/
 *     upsert({…})` sites → Map(table → Map(column → "file:line")).
 * Conservative by design: anything it can't statically resolve (computed keys, a
 * patch built by a helper, an unknown table) is SKIPPED, never guessed, so it
 * never red-flags a false positive.
 *
 * Used by scripts/audit-schema-columns.mjs (the CI guard) and by the enrich
 * write-safety test, so both agree on exactly what "the code writes" means.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

export const MIGRATIONS_DIR = "supabase/migrations";
export const SCAN_DIRS = ["app", "lib"];

const CONSTRAINT_STARTERS = new Set([
  "primary", "unique", "foreign", "check", "constraint", "exclude", "like",
]);

function stripStringsAndComments(sql) {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/** Split on commas at brace/bracket/paren depth 0 (ignores commas in strings and
 *  nested objects/arrays/calls — the fix that stops nested JSON keys leaking). */
export function splitTopLevel(s) {
  const out = [];
  let depth = 0, cur = "", str = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (str) {
      cur += ch;
      if (ch === "\\") { if (i + 1 < s.length) cur += s[++i]; continue; }
      if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { str = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseSchema(migrationsDir = MIGRATIONS_DIR) {
  const schema = new Map();
  const add = (t, c) => { if (!schema.has(t)) schema.set(t, new Set()); schema.get(t).add(c); };
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = stripStringsAndComments(readFileSync(join(migrationsDir, f), "utf8"));
    let m;
    const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
    while ((m = createRe.exec(sql))) {
      const table = m[1];
      let depth = 1, i = createRe.lastIndex;
      const start = i;
      for (; i < sql.length && depth > 0; i++) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") depth--;
      }
      for (const clause of splitTopLevel(sql.slice(start, i - 1))) {
        const t = clause.trim();
        const first = t.match(/^"?([a-z_][a-z0-9_]*)"?/i);
        if (!first) continue;
        const name = first[1].toLowerCase();
        if (CONSTRAINT_STARTERS.has(name)) continue;
        add(table, name);
      }
    }
    const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\b([\s\S]*?);/gi;
    while ((m = alterRe.exec(sql))) {
      const table = m[1], bodyA = m[2];
      let mm;
      const ac = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
      while ((mm = ac.exec(bodyA))) add(table, mm[1].toLowerCase());
      const dc = /drop\s+column\s+(?:if\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
      while ((mm = dc.exec(bodyA))) { const s = schema.get(table); if (s) s.delete(mm[1].toLowerCase()); }
      const rc = /rename\s+column\s+"?([a-z_][a-z0-9_]*)"?\s+to\s+"?([a-z_][a-z0-9_]*)"?/gi;
      while ((mm = rc.exec(bodyA))) { const s = schema.get(table); if (s) { s.delete(mm[1].toLowerCase()); s.add(mm[2].toLowerCase()); } }
    }
  }
  return schema;
}

export function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if ([".ts", ".tsx"].includes(extname(e.name))) out.push(p);
  }
  return out;
}

function balancedArg(src, open) {
  let depth = 0, i = open, str = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (str) { if (ch === "\\") { i++; continue; } if (ch === str) str = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { str = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return src.slice(open + 1);
}

function objectLiteralKeys(objText) {
  const keys = new Set();
  const spreads = [];
  let s = objText.trim();
  if (s.startsWith("{")) s = s.slice(1);
  if (s.endsWith("}")) s = s.slice(0, -1);
  for (const partRaw of splitTopLevel(s)) {
    const part = partRaw.trim();
    if (!part) continue;
    if (part.startsWith("...")) {
      const id = part.slice(3).trim().match(/^([A-Za-z_$][\w$]*)/);
      if (id) spreads.push(id[1]);
      const inner = part.match(/\{[\s\S]*\}/);
      if (inner) {
        const r = objectLiteralKeys(inner[0]);
        r.keys.forEach((k) => keys.add(k));
        r.spreads.forEach((sp) => spreads.push(sp));
      }
      continue;
    }
    if (part.startsWith("[")) continue; // computed key — skip
    const mm = part.match(/^["'`]?([A-Za-z_$][\w$]*)["'`]?\s*(:|$|\})/);
    if (mm) keys.add(mm[1]);
  }
  return { keys, spreads };
}

function resolveIdentifier(id, src, seen) {
  if (seen.has(id)) return new Set();
  seen.add(id);
  const keys = new Set();
  const declRe = new RegExp(`(?:(?:const|let|var)\\s+)?\\b${id}\\s*(?::[^=;{]+)?=(?![=>])\\s*\\{`, "g");
  let d;
  while ((d = declRe.exec(src))) {
    const braceOpen = src.indexOf("{", d.index + d[0].length - 1);
    if (braceOpen === -1) continue;
    let depth = 0, i = braceOpen, str = null;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (str) { if (ch === "\\") { i++; continue; } if (ch === str) str = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { str = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    const r = objectLiteralKeys(src.slice(braceOpen, i));
    r.keys.forEach((k) => keys.add(k));
    for (const sp of r.spreads) resolveIdentifier(sp, src, seen).forEach((k) => keys.add(k));
  }
  const assignRe = new RegExp(`\\b${id}\\.([A-Za-z_$][\\w$]*)\\s*=(?![=>])`, "g");
  let a;
  while ((a = assignRe.exec(src))) keys.add(a[1]);
  return keys;
}

function resolveArg(argText, src) {
  const t = argText.trim();
  if (t.startsWith("[")) {
    const brace = t.indexOf("{");
    if (brace !== -1) return resolveArg(t.slice(brace), src);
    return new Set();
  }
  if (t.startsWith("{")) {
    const r = objectLiteralKeys(t);
    const keys = new Set(r.keys);
    for (const sp of r.spreads) resolveIdentifier(sp, src, new Set()).forEach((k) => keys.add(k));
    return keys;
  }
  const idm = t.match(/^([A-Za-z_$][\w$]*)$/);
  if (idm) return resolveIdentifier(idm[1], src, new Set());
  return new Set();
}

const WRITE_RE = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)\s*(?:\.[A-Za-z_$][\w$]*\([^;]*?\)\s*)*?\.(insert|update|upsert)\s*\(/g;

/** Columns written to guarded tables, scanning the given files (or SCAN_DIRS). */
export function columnsWritten(guarded, files) {
  const list = files ?? SCAN_DIRS.flatMap(walk);
  const written = new Map();
  const record = (table, col, where) => {
    if (!written.has(table)) written.set(table, new Map());
    if (!written.get(table).has(col)) written.get(table).set(col, where);
  };
  for (const file of list) {
    let src;
    try { src = readFileSync(file, "utf8"); } catch { continue; }
    let m;
    WRITE_RE.lastIndex = 0;
    while ((m = WRITE_RE.exec(src))) {
      const table = m[1];
      if (guarded && !guarded.has(table)) continue;
      const parenOpen = src.indexOf("(", m.index + m[0].length - 1);
      if (parenOpen === -1) continue;
      const keys = resolveArg(balancedArg(src, parenOpen), src);
      const line = src.slice(0, m.index).split("\n").length;
      for (const k of keys) record(table, k, `${file}:${line}`);
    }
  }
  return written;
}
