#!/usr/bin/env node
/**
 * Rewrites the Material Symbols stylesheet URL in src/index.html so its
 * icon_names subset matches the icons the app actually uses. The subset
 * keeps the font download tiny (~20KB vs ~4MB unsubsetted), and because the
 * list lives in index.html it deploys atomically with the code — it cannot
 * go stale.
 *
 * Run after adding or removing an icon: node scripts/sync-icons.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// From `<mat-icon ...>name</mat-icon>` in templates and `icon: 'name'` in
// component code; EXTRA covers icons picked at runtime (template ternaries).
const EXTRA = ['expand_less', 'expand_more', 'history'];

const src = execSync(
  String.raw`grep -rhoE "<mat-icon[^>]*>[a-z0-9_]+</mat-icon>|icon: '[a-z0-9_]+'" src`,
  { encoding: 'utf8' },
);
const names = new Set(src.match(/[a-z0-9_]+(?=<|')/g));
for (const name of EXTRA) names.add(name);
const icons = [...names].sort();
if (!icons.length) throw new Error('No mat-icon names found in src');

const path = new URL('../src/index.html', import.meta.url).pathname;
const html = readFileSync(path, 'utf8');
const updated = html.replace(
  /(family=Material\+Symbols\+Outlined[^"]*?)(?:&icon_names=[a-z0-9_,]*)?(&display=block)/,
  `$1&icon_names=${icons.join(',')}$2`,
);
if (updated === html) throw new Error('Material Symbols link not found in src/index.html');
writeFileSync(path, updated);
console.log(`Subset to ${icons.length} icons: ${icons.join(', ')}`);
