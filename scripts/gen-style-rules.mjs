#!/usr/bin/env node
/**
 * Regenerates src/shared/style-rules.ts from the upstream Vale style packages
 * (https://github.com/vale-cli/packages and friends).
 *
 * Each package zip holds one YAML file per rule. We keep the rule id (file
 * name) and its user-facing message so the settings screen can offer per-rule
 * toggles without bundling the full Vale definitions.
 *
 * Usage: node scripts/gen-style-rules.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

/** `dir` pins the style directory when the repo holds more than one. */
const PACKAGES = [
  { id: 'proselint', repo: 'https://github.com/errata-ai/proselint.git', dir: 'proselint' },
  { id: 'google', repo: 'https://github.com/errata-ai/Google.git', dir: 'Google' },
  { id: 'microsoft', repo: 'https://github.com/errata-ai/Microsoft.git', dir: 'Microsoft' },
  { id: 'redhat', repo: 'https://github.com/redhat-documentation/vale-at-red-hat.git', dir: 'RedHat' },
  { id: 'write-good', repo: 'https://github.com/errata-ai/write-good.git', dir: 'write-good' },
  { id: 'alex', repo: 'https://github.com/errata-ai/alex.git', dir: 'alex' },
  { id: 'joblint', repo: 'https://github.com/errata-ai/Joblint.git', dir: 'Joblint' },
  { id: 'readability', repo: 'https://github.com/errata-ai/Readability.git', dir: 'Readability' },
  { id: 'ai-tells', repo: 'https://github.com/tbhb/vale-ai-tells.git' },
  { id: 'openly', repo: 'https://github.com/ChrisChinchilla/Openly.git', dir: 'Openly' },
];

const work = mkdtempSync(join(tmpdir(), 'vale-styles-'));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** First `<name>:` scalar value in a rule file, handling quotes and `|`/`>` blocks. */
function fieldOf(lines, name) {
  const at = lines.findIndex((l) => new RegExp(`^${name}:`).test(l));
  if (at === -1) return '';
  let value = lines[at].replace(new RegExp(`^${name}:\\s*`), '').trim();
  if (/^[|>][-+]?$/.test(value)) {
    value = (lines[at + 1] ?? '').trim();
  }
  if (/^['"]/.test(value)) value = value.slice(1, value.endsWith(value[0]) ? -1 : undefined);
  return value.replaceAll("''", "'").trim();
}

/** The `extends:` check type (e.g. `existence`, `substitution`). */
function extendsOf(lines) {
  const at = lines.findIndex((l) => /^extends:/.test(l));
  if (at === -1) return '';
  return lines[at].replace(/^extends:\s*/, '').trim();
}

/** Strips a leading/trailing YAML quote (`'...'` with `''` escapes, or `"..."` with `\"`). */
function unquote(raw) {
  const s = raw.trim();
  if (!/^['"]/.test(s)) return s;
  const q = s[0];
  let out = '';
  for (let i = 1; i < s.length; i++) {
    if (q === "'" && s[i] === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i++;
        continue;
      }
      break;
    }
    if (q === '"' && s[i] === '\\' && s[i + 1] === '"') {
      out += '"';
      i++;
      continue;
    }
    if (q === '"' && s[i] === '"') break;
    out += s[i];
  }
  return out;
}

/** Lines belonging to a top-level `<name>:` block (indented, contiguous). */
function blockLines(lines, name) {
  const at = lines.findIndex((l) => new RegExp(`^${name}:\\s*$`).test(l));
  if (at === -1) return [];
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) break;
    out.push(line);
  }
  return out;
}

/** `[key, value]` pairs from a `swap:` map, preserving source order. */
function swapEntries(lines) {
  const entries = [];
  for (const raw of blockLines(lines, 'swap')) {
    const trimmed = raw.trim();
    let key, rest;
    if (/^['"]/.test(trimmed)) {
      const q = trimmed[0];
      let i = 1;
      while (i < trimmed.length) {
        if (q === "'" && trimmed[i] === "'") {
          if (trimmed[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (q === '"' && trimmed[i] === '\\' && trimmed[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (q === '"' && trimmed[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      key = unquote(trimmed.slice(0, i));
      rest = trimmed.slice(i).replace(/^\s*:\s*/, '');
    } else {
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      key = trimmed.slice(0, idx).trim();
      rest = trimmed.slice(idx + 1).trim();
    }
    if (key) entries.push([key, unquote(rest)]);
  }
  return entries;
}

/** Literal items from a `tokens:` list, preserving source order. */
function tokenEntries(lines) {
  return blockLines(lines, 'tokens')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => unquote(l.slice(1).trim()));
}

// Vale example text needs to be short and free of regex syntax to read as
// plain English in the settings table.
const REGEX_META = /[()[\]|?*+\\{}]/;
function isLiteralExample(s) {
  return s.length > 0 && s.length <= 30 && !REGEX_META.test(s);
}

/** Fills `%s` placeholders in `template` with real data from the rule, per Vale's own semantics. */
function instantiate(template, extendsType, lines) {
  if (!template.includes('%s')) return template;
  if (extendsType === 'substitution') {
    for (const [key, value] of swapEntries(lines)) {
      if (!isLiteralExample(key) || !isLiteralExample(value)) continue;
      const count = (template.match(/%s/g) ?? []).length;
      if (count >= 2) {
        // Vale's substitution check formats messages as (replacement, flagged),
        // i.e. (swap value, swap key) — see internal/check/substitution.go.
        let n = 0;
        return template.replace(/%s/g, () => (n++ === 0 ? value : key));
      }
      return template.replaceAll('%s', key);
    }
  } else if (extendsType === 'existence') {
    for (const token of tokenEntries(lines)) {
      if (!isLiteralExample(token)) continue;
      return template.replaceAll('%s', token);
    }
  }
  return template.replaceAll('%s', '…');
}

/** A meaningful hint for a rule: its `description:` if present, else its instantiated `message:`. */
function hintOf(yaml) {
  const lines = yaml.split('\n');
  const description = fieldOf(lines, 'description');
  const message = fieldOf(lines, 'message');
  const template = description || message;
  if (!template) return '';
  return instantiate(template, extendsOf(lines), lines).trim();
}

const catalog = {};
for (const pkg of PACKAGES) {
  const out = join(work, pkg.id);
  execFileSync('git', ['clone', '--quiet', '--depth', '1', pkg.repo, out]);

  // Rules live one-per-file in the style's directory; group by parent dir and
  // keep the pinned directory (or the largest group when unpinned) to skip
  // stray config/fixture YAML.
  const groups = new Map();
  for (const path of walk(out)) {
    if (!/\.ya?ml$/.test(path) || /(^|\/)\./.test(basename(path))) continue;
    const yaml = readFileSync(path, 'utf8');
    if (!/^extends:/m.test(yaml)) continue;
    const rule = { id: basename(path).replace(/\.ya?ml$/, ''), hint: hintOf(yaml) };
    const dir = dirname(path);
    groups.set(dir, [...(groups.get(dir) ?? []), rule]);
  }
  const candidates = [...groups.entries()]
    .filter(([dir]) => !pkg.dir || basename(dir) === pkg.dir)
    .map(([, rules]) => rules);
  const rules = candidates.sort((a, b) => b.length - a.length)[0] ?? [];
  rules.sort((a, b) => a.id.localeCompare(b.id));
  catalog[pkg.id] = rules;
  console.log(`${pkg.id}: ${rules.length} rules`);
}

const file = `/**
 * Generated by scripts/gen-style-rules.mjs. Do not edit by hand.
 *
 * Rule ids and messages come from the upstream Vale style packages so the
 * settings screen can expose per-rule toggles.
 */

export interface StyleRule {
  id: string;
  hint: string;
}

export const STYLE_RULES: Readonly<Record<string, readonly StyleRule[]>> =
  ${JSON.stringify(catalog, null, 2)};
`;

writeFileSync(new URL('../src/shared/style-rules.ts', import.meta.url), file);
console.log('Wrote src/shared/style-rules.ts');
