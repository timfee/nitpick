import type { EditorState } from '@tiptap/pm/state';

import { lintRangeById } from './lint-highlight';
import type { UiFinding } from './text-index';

/** Findings that sit in the same paragraph, reviewed and fixed together. */
export interface FixGroup {
  findings: UiFinding[];
}

/** Start/end bounds of the textblock (paragraph) holding `pos`. */
export function blockBounds(state: EditorState, pos: number): { from: number; to: number } {
  const $p = state.doc.resolve(pos);
  return { from: $p.start($p.depth), to: $p.end($p.depth) };
}

/** Document position of the start of the textblock (paragraph) holding `pos`. */
export function blockStart(state: EditorState, pos: number): number {
  return blockBounds(state, pos).from;
}

/**
 * Buckets findings by the paragraph (textblock) they sit in, in document
 * order. Findings whose highlight is gone or spans blocks are left out — the
 * sidebar still lists them for manual review.
 */
export function buildFixGroups(state: EditorState, findings: UiFinding[]): FixGroup[] {
  const byBlock = new Map<number, UiFinding[]>();
  for (const finding of findings) {
    const range = lintRangeById(state, finding.id);
    if (!range) continue;
    const bounds = blockBounds(state, range.from);
    if (range.to > bounds.to) continue;
    byBlock.set(bounds.from, [...(byBlock.get(bounds.from) ?? []), finding]);
  }
  return [...byBlock.entries()].sort(([a], [b]) => a - b).map(([, group]) => ({ findings: group }));
}
