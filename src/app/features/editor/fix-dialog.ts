import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type { Editor } from '@tiptap/core';

import type { LintFinding } from '../../../shared/lint';
import { LintApi } from '../../core/lint-api';
import { blockBounds, type FixGroup } from './blocks';
import { DiffPane } from './diff-pane';
import { lintRangeById } from './lint-highlight';
import type { UiFinding } from './text-index';
import { diffWords } from './word-diff';

export interface FixDialogData {
  editor: Editor;
  groups: FixGroup[];
  /** Called as the user approves findings so the panel behind stays in sync. */
  onResolved: (ids: string[]) => void;
}

interface Step {
  findings: UiFinding[];
  original: string;
}

interface Replacement {
  from: number;
  to: number;
  text: string;
}

@Component({
  selector: 'nit-fix-dialog',
  imports: [MatButtonModule, MatDialogModule, MatProgressBarModule, DiffPane],
  templateUrl: './fix-dialog.html',
  styleUrl: './fix-dialog.scss',
})
export class FixDialog {
  private readonly data = inject<FixDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<FixDialog>>(MatDialogRef);
  private readonly api = inject(LintApi);

  protected readonly total = this.data.groups.reduce((n, g) => n + g.findings.length, 0);
  protected readonly groupCount = this.data.groups.length;
  protected readonly approved = signal(0);

  private readonly index = signal(0);
  protected readonly paragraph = computed(() => Math.min(this.index() + 1, this.groupCount));
  private processed = 0;

  protected readonly step = signal<Step | null>(null);
  protected readonly suggestion = signal<string | null>(null);
  protected readonly source = signal<'rules' | 'ai'>('rules');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly progress = computed(() => {
    // Depend on the step so the bar advances as each group completes.
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
      // Apply exactly the plan that produced the preview: the same
      // right-to-left, overlap-free replacements, so accepted text always
      // matches the suggested pane.
      const plan = this.replacementPlan(live);
      editor
        .chain()
        .command(({ tr }) => {
          for (const part of plan) tr.insertText(part.text, part.from, part.to);
          return plan.length > 0;
        })
        .run();
    }

    for (const f of live) this.data.editor.commands.removeLintRange(f.id);
    this.data.onResolved(live.map((f) => f.id));
    this.approved.update((n) => n + live.length);
    this.advance();
  }

  private advance(): void {
    // Consume the group's full issue count so the progress bar completes even
    // when some findings went stale before this step.
    const group = this.data.groups[this.index()];
    if (group) this.processed += group.findings.length;
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
    return blockBounds(state, range.from);
  }

  private loadStep(): void {
    if (this.index() >= this.data.groups.length) {
      this.ref.close();
      return;
    }
    const live = this.liveFindings();
    const bounds = this.blockBounds();
    if (!live.length || !bounds) {
      this.advance();
      return;
    }

    const state = this.data.editor.state;
    // The ' ' leaf text keeps string offsets aligned with doc positions when
    // the paragraph contains inline leaves like hard breaks.
    const original = state.doc.textBetween(bounds.from, bounds.to, '\n', ' ');
    this.step.set({ findings: live, original });
    this.error.set(null);

    if (live.every((f) => f.suggestion)) {
      const plan = this.replacementPlan(live);
      this.suggestion.set(this.composeFromSuggestions(original, plan, bounds.from));
      this.source.set('rules');
    } else {
      // At least one issue has no drop-in replacement, so ask the model.
      void this.requestRewrite();
    }
  }

  /**
   * The replacements to apply, in document coordinates, right to left, with
   * overlapping findings dropped. Preview and accept both consume this, so
   * they can never disagree.
   */
  private replacementPlan(live: UiFinding[]): Replacement[] {
    const state = this.data.editor.state;
    const parts = live
      .flatMap((f) => {
        const range = lintRangeById(state, f.id);
        return range ? [{ from: range.from, to: range.to, text: f.suggestion }] : [];
      })
      .sort((a, b) => b.from - a.from);

    const plan: Replacement[] = [];
    let prevFrom = Number.POSITIVE_INFINITY;
    for (const part of parts) {
      if (part.to > prevFrom) continue;
      plan.push(part);
      prevFrom = part.from;
    }
    return plan;
  }

  /** Splices the plan's replacements into the paragraph text for preview. */
  private composeFromSuggestions(
    original: string,
    plan: Replacement[],
    blockFrom: number,
  ): string {
    let text = original;
    for (const part of plan) {
      const from = part.from - blockFrom;
      const to = part.to - blockFrom;
      if (from < 0 || to > text.length) continue;
      text = text.slice(0, from) + part.text + text.slice(to);
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
      this.error.set('The rewrite failed. Retry, or skip this paragraph.');
    } finally {
      this.loading.set(false);
    }
  }
}
