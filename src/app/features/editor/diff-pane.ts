import { Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import type { DiffSegment } from './word-diff';

/**
 * One labelled pane of a word diff: a heading over the diff segments, with
 * changed segments marked via `change` (line-through on the original,
 * highlight on the suggestion). Shows a spinner or error in place of the
 * segments while a rewrite is loading or failed.
 */
@Component({
  selector: 'nit-diff-pane',
  imports: [MatProgressSpinnerModule],
  templateUrl: './diff-pane.html',
  styleUrl: './diff-pane.scss',
})
export class DiffPane {
  readonly heading = input.required<string>();
  readonly segments = input<DiffSegment[]>([]);
  /** Class applied to changed segments: `del` for deletions, `ins` for insertions. */
  readonly change = input<'del' | 'ins'>('del');
  readonly loading = input(false);
  readonly error = input<string | null>(null);
}
