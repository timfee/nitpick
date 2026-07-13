#!/usr/bin/env node
/**
 * Self-healing prose linting with Vale across the places prose lives:
 *
 *   1. Markdown docs, linted directly.
 *   2. Code comments in .ts and .mjs files, where Vale lints only the
 *      comments. Each .mjs file gets copied as .js because Vale's
 *      `[formats]` remapping silently lints nothing for code formats, so
 *      the extension has to be real.
 *   3. Microcopy in Angular templates (external and inline) and in
 *      user-facing string literals. Vale's HTML parser can't handle
 *      @if/@for control flow, so the script masks templates down to their
 *      user-visible text (text nodes plus a11y and tooltip attributes),
 *      replacing every masked character with a space to keep line and
 *      column numbers exact.
 *
 * Masked copies go to a temp mirror as `<path>.txt` or `<path>.js`, and
 * findings map back to the real files. Because masking preserves
 * positions, fixes apply directly to the real sources.
 *
 * By default the script heals what it safely can (Latin abbreviations,
 * sentence spacing, exclamation points, emojis, repeated words, wordy
 * phrases) and re-lints until nothing fixable remains. It then reports
 * what needs human judgment. The check-only mode just reports, through
 * `npm run lint:prose:check`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTemplate } from '@angular/compiler';
import ts from 'typescript';

const checkOnly = process.argv.includes('--check');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Use the wrapper package's real path: npm does not always link
// node_modules/.bin/vale because the binary appears only during the
// package's postinstall download. Rebuild once if it's missing entirely.
const vale = path.join(root, 'node_modules', '@vvago', 'vale', 'bin', 'vale');
if (!existsSync(vale)) {
  execFileSync('npm', ['rebuild', '@vvago/vale'], { cwd: root, stdio: 'inherit' });
}

/** Static attributes whose values are user-visible or read by screen readers. */
const TEXT_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'label',
  'matTooltip',
  'placeholder',
  'title',
]);

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  // The vendored agent skills are third-party text, not this repo's prose.
  .filter((f) => !f.startsWith('.agents/'))
  // GEMINI.md is a symlink to AGENTS.md. Linting both would double-report.
  .filter((f) => f !== 'GEMINI.md');

const markdown = tracked.filter((f) => f.endsWith('.md'));
const typescript = tracked.filter((f) => f.endsWith('.ts'));
const scripts = tracked.filter((f) => f.endsWith('.mjs'));
const templates = tracked.filter((f) => f.endsWith('.html') && f.startsWith('src/'));
// Generated from upstream Vale style metadata. Fixes belong upstream.
const generated = new Set(['src/shared/style-rules.ts']);

/** Replaces every character with a space, preserving newlines and length. */
const blank = (text) => text.replace(/[^\n]/g, ' ');

/**
 * Returns `source` with everything except human-visible template text
 * blanked out. `nodes` are template AST nodes whose spans index into
 * `source`.
 */
const maskTemplate = (source, nodes) => {
  const out = Array.from(blank(source));
  const keep = (span) => {
    if (!span) return;
    for (let i = span.start.offset; i < span.end.offset; i += 1) out[i] = source[i];
  };
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const kind = node.constructor.name;
    if (kind === 'Text' || kind === 'BoundText') keep(node.sourceSpan);
    if (kind === 'TextAttribute' && TEXT_ATTRIBUTES.has(node.name)) keep(node.valueSpan);
    // mat-icon children are ligature names like `upload_file`, not prose.
    const keys =
      kind === 'Element' && node.name === 'mat-icon'
        ? ['attributes']
        : ['children', 'branches', 'cases', 'attributes'];
    for (const key of keys) {
      for (const child of node[key] ?? []) walk(child);
    }
    for (const key of ['empty', 'placeholder', 'loading', 'error']) {
      if (node[key]) walk(node[key]);
    }
  };
  for (const node of nodes) walk(node);
  // Interpolations and HTML entities are markup, not prose.
  return out
    .join('')
    .replace(/\{\{[^]*?\}\}/g, blank)
    .replace(/&[a-z]+;/g, blank);
};

/**
 * String literals holding user-facing copy, meaning at least three words
 * of real text that isn't markup. This pass covers copy that lives in
 * code, like toasts and error messages.
 */
const proseLiterals = (file, source) => {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const spans = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      // Component styles and templates are code, not copy.
      const owner = node.parent?.parent ?? node.parent;
      const property =
        (ts.isPropertyAssignment(owner) && owner.name.getText(sourceFile)) ||
        (ts.isPropertyAssignment(node.parent) && node.parent.name.getText(sourceFile));
      const text = node.text;
      // Prose means three or more plain words. Protocol strings such as
      // Content-Type header values never qualify.
      const words = text.trim().split(/\s+/);
      const wordy = words.filter((w) => /^[A-Za-z][a-z']*[.,!?:]?$/.test(w)).length >= 3;
      if (
        wordy &&
        !text.trim().startsWith('<') &&
        property !== 'styles' &&
        property !== 'template'
      ) {
        // `end` sits on the closing quote. The emit step turns it into a
        // period so neighboring literals never merge into one "sentence".
        spans.push({ start: node.getStart(sourceFile) + 1, end: node.getEnd() - 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return spans;
};

/** Extracts `template:`-backtick literals from a component source file. */
const inlineTemplates = (source) => {
  const found = [];
  const open = /template:\s*`/g;
  for (let match; (match = open.exec(source));) {
    const start = match.index + match[0].length;
    const end = source.indexOf('`', start);
    if (end < 0) continue;
    found.push({ start, text: source.slice(start, end) });
    open.lastIndex = end + 1;
  }
  return found;
};

const run = (args, cwd) => {
  const { stdout, stderr, status, error } = spawnSync(
    vale,
    ['--output=JSON', '--config', path.join(root, '.vale.ini'), ...args],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (error) throw error;
  // Vale exits 1 for findings (with JSON on stdout) but 2 for its own
  // errors, so a broken config must not read as a clean run.
  if (!stdout.trim()) {
    if (status) throw new Error(stderr.trim() || `vale exited with ${status}`);
    return {};
  }
  return JSON.parse(stdout);
};

/** One full lint pass. Returns a Map of real file path to Vale alerts. */
const lintOnce = () => {
  const work = mkdtempSync(path.join(tmpdir(), 'nitpick-prose-'));
  const masked = [];
  const emit = (file, suffix, content) => {
    const rel = `${file}${suffix}`;
    const dest = path.join(work, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, content);
    masked.push(rel);
  };

  for (const file of templates) {
    const source = readFileSync(path.join(root, file), 'utf8');
    const { nodes, errors } = parseTemplate(source, file, { preserveWhitespaces: true });
    if (errors?.length) {
      console.error(`${file}: template parse error — ${errors[0].msg}`);
      process.exitCode = 2;
      continue;
    }
    emit(file, '.txt', maskTemplate(source, nodes));
  }

  for (const file of typescript) {
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const { start, text } of inlineTemplates(source)) {
      const { nodes, errors } = parseTemplate(text, file, { preserveWhitespaces: true });
      if (errors?.length) continue;
      const mask = blank(source.slice(0, start)) + maskTemplate(text, nodes);
      emit(file, '.txt', mask + blank(source.slice(start + text.length)));
    }
    if (generated.has(file)) continue;
    const literals = proseLiterals(file, source);
    if (literals.length) {
      const out = Array.from(blank(source));
      for (const { start, end } of literals) {
        for (let i = start; i < end; i += 1) out[i] = source[i];
        // Concatenated fragments (`'a ' + 'b'`) continue the same sentence,
        // and only literals that truly end get the period terminator.
        let next = end + 1;
        while (next < source.length && /\s/.test(source[next])) next += 1;
        if (source[next] !== '+') out[end] = '.';
      }
      emit(file, '.strings.txt', out.join(''));
    }
  }

  for (const file of scripts) {
    emit(file, '.js', readFileSync(path.join(root, file), 'utf8'));
  }

  const results = new Map();
  const record = (byFile, mapPath) => {
    for (const [file, alerts] of Object.entries(byFile)) {
      const real = mapPath(file);
      results.set(real, [...(results.get(real) ?? []), ...alerts]);
    }
  };

  try {
    record(run([...markdown, ...typescript], root), (f) => f);
    if (masked.length) {
      record(run(masked, work), (f) => f.replace(/\.(strings\.txt|txt|js)$/, ''));
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return results;
};

/**
 * Mechanical fixes, keyed by check. Each takes the flagged text and returns
 * the healed replacement. Checks that need judgment (spelling, filler,
 * heading case) have no entry and go into the report instead.
 */
const fixers = {
  'Nitpick.Latin': (text) =>
    text
      .replace(/e\.g\./i, (m) => (m.startsWith('E') ? 'Such as' : 'such as'))
      .replace(/i\.e\./i, (m) => (m.startsWith('I') ? 'That is' : 'that is')),
  'Nitpick.Spacing': (text) => text.replace(/ {2,}/g, ' '),
  'Nitpick.Exclamation': (text) => text.replace('!', '.'),
  'Nitpick.Emoji': () => '',
  'Vale.Repetition': (text) => text.split(/\s+/)[0],
};

/**
 * Returns the healed replacement for an alert, or null when the finding
 * needs human judgment. Substitution rules carry their replacement in the
 * alert's action, and hand-written fixers cover the rest.
 */
const healFor = (alert, text) => {
  const fixer = fixers[alert.Check];
  if (fixer) return fixer(text);
  if (alert.Action?.Name === 'replace' && alert.Action.Params?.length === 1) {
    const swap = alert.Action.Params[0];
    return /^[A-Z]/.test(text) ? swap.charAt(0).toUpperCase() + swap.slice(1) : swap;
  }
  return null;
};
const fixable = (alert) =>
  Boolean(fixers[alert.Check]) ||
  (alert.Action?.Name === 'replace' && alert.Action.Params?.length === 1);

/** Applies fixable alerts to a file. Returns the number applied. */
const heal = (file, alerts) => {
  const target = path.join(root, file);
  let source = readFileSync(target, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  const edits = alerts
    .map((a) => ({
      start: lineStarts[a.Line - 1] + a.Span[0] - 1,
      end: lineStarts[a.Line - 1] + a.Span[1],
      alert: a,
    }))
    .sort((a, b) => b.start - a.start);
  let applied = 0;
  for (let { start, end, alert } of edits) {
    const text = source.slice(start, end);
    const healed = healFor(alert, text);
    if (healed === null || healed === text) continue;
    // A removal must take one neighboring space with it.
    if (healed === '' && source[end] === ' ') end += 1;
    else if (healed === '' && source[start - 1] === ' ') start -= 1;
    source = source.slice(0, start) + healed + source.slice(end);
    applied += 1;
  }
  if (applied) writeFileSync(target, source);
  return applied;
};

const MAX_PASSES = 5;
let results = lintOnce();

if (!checkOnly) {
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    let healedCount = 0;
    for (const [file, alerts] of results) {
      const healable = alerts.filter(fixable);
      if (healable.length) healedCount += heal(file, healable);
    }
    if (!healedCount) break;
    console.log(`Pass ${pass}: healed ${healedCount} finding${healedCount === 1 ? '' : 's'}.`);
    results = lintOnce();
  }
}

const counts = { error: 0, warning: 0, suggestion: 0 };
for (const file of [...results.keys()].sort()) {
  const alerts = results.get(file).sort((a, b) => a.Line - b.Line || a.Span[0] - b.Span[0]);
  if (!alerts.length) continue;
  console.log(`\n${file}`);
  for (const alert of alerts) {
    counts[alert.Severity] += 1;
    console.log(
      `  ${alert.Line}:${alert.Span[0]}  ${alert.Severity.padEnd(10)}  ${alert.Message}  [${alert.Check}]`,
    );
  }
}

console.log(
  `\n${counts.error} errors, ${counts.warning} warnings, ${counts.suggestion} suggestions.`,
);
if (counts.error + counts.warning > 0) process.exitCode = 1;
