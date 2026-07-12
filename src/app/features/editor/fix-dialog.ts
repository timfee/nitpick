import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

import type { LintFinding } from '../../../shared/lint';
import { LintApi } from '../../core/lint-api';
import { lintRangeById } from './lint-highlight';
import type { UiFinding } from './text-index';

/** Findings that sit in the same paragraph, reviewed and fixed together. */
export interface FixGroup {
  findings: UiFinding[];
}

export interface FixDialogData {
  editor: Editor;
  groups: FixGroup[];
  /** Called as findings are approved so the panel behind stays in sync. */
  onResolved: (ids: string[]) => void;
}

export interface FixDialogResult {
  approved: number;
  /** Editor transactions applied — how many undo steps revert everything. */
  undoSteps: number;
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
    const $from = state.doc.resolve(range.from);
    if (range.to > $from.end($from.depth)) continue;
    const block = $from.start($from.depth);
    byBlock.set(block, [...(byBlock.get(block) ?? []), finding]);
  }
  return [...byBlock.entries()].sort(([a], [b]) => a - b).map(([, group]) => ({ findings: group }));
}

interface Step {
  findings: UiFinding[];
  original: string;
}

interface DiffSegment {
  changed: boolean;
  text: string;
}

@Component({
  selector: 'nit-fix-dialog',
  imports: [MatButtonModule, MatDialogModule, MatProgressBarModule, MatProgressSpinnerModule],
  templateUrl: './fix-dialog.html',
  styleUrl: './fix-dialog.scss',
})
export class FixDialog {
  private readonly data = inject<FixDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<FixDialog, FixDialogResult>>(MatDialogRef);
  private readonly api = inject(LintApi);

  protected readonly total = this.data.groups.reduce((n, g) => n + g.findings.length, 0);
  protected readonly groupCount = this.data.groups.length;
  protected readonly approved = signal(0);

  private readonly index = signal(0);
  protected readonly paragraph = computed(() => Math.min(this.index() + 1, this.groupCount));
  private processed = 0;
  private undoSteps = 0;

  protected readonly step = signal<Step | null>(null);
  protected readonly suggestion = signal<string | null>(null);
  protected readonly source = signal<'rules' | 'ai'>('rules');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly progress = computed(() => {
    // Depend on the step so the bar advances as groups are processed.
    this.step();
    return this.total ? (this.processed / this.total) * 100 : 0;
  });

  private readonly diff = computed(() => {
    const step = this.step();
    const suggestion = this.suggestion();
    if (!step) return null;
    return diffWords(step.original, suggestion ?? step.original);
  });
  protected readonly originalDiff = computed(() => this.diff()?.original ?? []);
  protected readonly suggestedDiff = computed(() => this.diff()?.suggested ?? []);

  constructor() {
    this.loadStep();
  }

  protected skip(): void {
    this.processed += this.liveFindings().length;
    this.advance();
  }

  protected retry(): void {
    void this.requestRewrite();
  }

  protected accept(): void {
    const rewrite = this.suggestion();
    const live = this.liveFindings();
    if (!rewrite || !live.length) return;

    const { editor } = this.data;
    if (this.source() === 'ai') {
      const bounds = this.blockBounds();
      if (bounds) {
        editor
          .chain()
          .command(({ tr }) => {
            tr.insertText(rewrite, bounds.from, bounds.to);
            return true;
          })
          .run();
      }
    } else {
      // Apply each rule suggestion at its own (transaction-mapped) range,
      // right to left so earlier ranges stay valid within the transaction.
      editor
        .chain()
        .command(({ state, tr }) => {
          const spots = live
            .map((f) => ({ f, range: lintRangeById(state, f.id) }))
            .filter((s): s is { f: UiFinding; range: NonNullable<typeof s.range> } => !!s.range)
            .sort((a, b) => b.range.from - a.range.from);
          for (const { f, range } of spots) tr.insertText(f.suggestion, range.from, range.to);
          return spots.length > 0;
        })
        .run();
    }

    for (const f of live) this.data.editor.commands.removeLintRange(f.id);
    this.data.onResolved(live.map((f) => f.id));
    this.approved.update((n) => n + live.length);
    this.processed += live.length;
    this.undoSteps += 1;
    this.advance();
  }

  private advance(): void {
    this.index.update((i) => i + 1);
    this.loadStep();
  }

  /** Findings of the current group whose highlight still exists. */
  private liveFindings(): UiFinding[] {
    const group = this.data.groups[this.index()];
    if (!group) return [];
    const state = this.data.editor.state;
    return group.findings.filter((f) => lintRangeById(state, f.id));
  }

  private blockBounds(): { from: number; to: number } | null {
    const live = this.liveFindings();
    if (!live.length) return null;
    const state = this.data.editor.state;
    const range = lintRangeById(state, live[0].id);
    if (!range) return null;
    const $from = state.doc.resolve(range.from);
    return { from: $from.start($from.depth), to: $from.end($from.depth) };
  }

  private loadStep(): void {
    if (this.index() >= this.data.groups.length) {
      this.ref.close({ approved: this.approved(), undoSteps: this.undoSteps });
      return;
    }
    const live = this.liveFindings();
    const bounds = this.blockBounds();
    if (!live.length || !bounds) {
      this.advance();
      return;
    }

    const state = this.data.editor.state;
    const original = state.doc.textBetween(bounds.from, bounds.to);
    this.step.set({ findings: live, original });
    this.error.set(null);

    if (live.every((f) => f.suggestion)) {
      this.suggestion.set(this.composeFromSuggestions(original, live, bounds.from));
      this.source.set('rules');
    } else {
      // At least one issue has no drop-in replacement — ask the model.
      void this.requestRewrite();
    }
  }

  /** Splices each finding's drop-in suggestion into the paragraph text. */
  private composeFromSuggestions(original: string, live: UiFinding[], blockFrom: number): string {
    const state = this.data.editor.state;
    const parts = live
      .flatMap((f) => {
        const range = lintRangeById(state, f.id);
        return range ? [{ from: range.from - blockFrom, to: range.to - blockFrom, text: f.suggestion }] : [];
      })
      .sort((a, b) => b.from - a.from);

    let text = original;
    let prevFrom = Number.POSITIVE_INFINITY;
    for (const part of parts) {
      if (part.to > prevFrom || part.from < 0) continue;
      text = text.slice(0, part.from) + part.text + text.slice(part.to);
      prevFrom = part.from;
    }
    return text;
  }

  private async requestRewrite(): Promise<void> {
    const step = this.step();
    if (!step) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const findings: LintFinding[] = step.findings.map(
        ({ category, severity, quote, message, suggestion, rule }) => ({
          category,
          severity,
          quote,
          message,
          suggestion,
          rule,
        }),
      );
      const { rewrite } = await this.api.fix(step.original, findings);
      this.suggestion.set(rewrite);
      this.source.set('ai');
    } catch {
      this.suggestion.set(null);
      this.error.set('The rewrite failed — retry, or skip this paragraph.');
    } finally {
      this.loading.set(false);
    }
  }
}

/**
 * Word-level LCS diff. Both sides share the `changed` flag: deletions on the
 * original, insertions on the suggestion. Falls back to unmarked text when
 * the inputs are too large for the quadratic table.
 */
function diffWords(
  a: string,
  b: string,
): { original: DiffSegment[]; suggested: DiffSegment[] } {
  const aTokens = a.split(/(\s+)/).filter(Boolean);
  const bTokens = b.split(/(\s+)/).filter(Boolean);
  if (aTokens.length * bTokens.length > 500_000) {
    return { original: [{ changed: false, text: a }], suggested: [{ changed: false, text: b }] };
  }

  const rows = aTokens.length + 1;
  const cols = bTokens.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = aTokens.length - 1; i >= 0; i--) {
    for (let j = bTokens.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        aTokens[i] === bTokens[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }

  const original: DiffSegment[] = [];
  const suggested: DiffSegment[] = [];
  const push = (list: DiffSegment[], changed: boolean, text: string) => {
    const last = list[list.length - 1];
    if (last?.changed === changed) last.text += text;
    else list.push({ changed, text });
  };

  let i = 0;
  let j = 0;
  while (i < aTokens.length && j < bTokens.length) {
    if (aTokens[i] === bTokens[j]) {
      push(original, false, aTokens[i]);
      push(suggested, false, bTokens[j]);
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      push(original, true, aTokens[i]);
      i++;
    } else {
      push(suggested, true, bTokens[j]);
      j++;
    }
  }
  while (i < aTokens.length) push(original, true, aTokens[i++]);
  while (j < bTokens.length) push(suggested, true, bTokens[j++]);

  return { original, suggested };
}
