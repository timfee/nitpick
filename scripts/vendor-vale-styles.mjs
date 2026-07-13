#!/usr/bin/env node
/**
 * Vendors third-party Vale styles into .vale/styles so linting needs no
 * network or `vale sync`. Sources stay pinned. Rerun after bumping a ref.
 * Files come through jsDelivr's GitHub mirror.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stylesDir = path.join(root, '.vale', 'styles');

const SOURCES = [
  { repo: 'errata-ai/proselint', ref: 'master', dir: '/proselint', style: 'proselint' },
  { repo: 'errata-ai/write-good', ref: 'master', dir: '/write-good', style: 'write-good' },
  { repo: 'tbhb/vale-ai-tells', ref: 'v1.22.1', dir: '/styles/ai-tells', style: 'ai-tells' },
  {
    repo: 'tbhb/vale-ai-tells',
    ref: 'v1.22.1',
    dir: '/styles/ai-tells-commits',
    style: 'ai-tells-commits',
  },
  { repo: 'ChrisChinchilla/Openly', ref: '0.4.6', dir: '/Openly', style: 'Openly' },
];

const listFiles = async (repo, ref) => {
  const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${repo}@${ref}`);
  if (!res.ok) throw new Error(`listing ${repo}@${ref}: ${res.status}`);
  const paths = [];
  const walk = (files, prefix) => {
    for (const f of files ?? []) {
      const p = `${prefix}/${f.name}`;
      if (f.type === 'directory') walk(f.files, p);
      else paths.push(p);
    }
  };
  walk((await res.json()).files, '');
  return paths;
};

for (const { repo, ref, dir, style } of SOURCES) {
  const files = (await listFiles(repo, ref)).filter((p) => p.startsWith(`${dir}/`));
  if (!files.length) throw new Error(`no files under ${dir} in ${repo}@${ref}`);
  for (const file of files) {
    const res = await fetch(`https://cdn.jsdelivr.net/gh/${repo}@${ref}${file}`);
    if (!res.ok) throw new Error(`fetching ${file}: ${res.status}`);
    const dest = path.join(stylesDir, style, file.slice(dir.length + 1));
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`${style}: ${files.length} files from ${repo}@${ref}${dir}`);
}
