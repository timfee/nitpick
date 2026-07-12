import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { SuggestionChip } from './suggestion-chip';
import type { UiFinding } from './text-index';

/**
 * Floating card under a clicked highlight: the finding's message, its
 * drop-in replacement when there is one, and the escape hatches. The parent
 * positions the host element inside the editor's scroll content.
 */
@Component({
  selector: 'nit-lint-popover',
  imports: [MatButtonModule, SuggestionChip],
  templateUrl: './lint-popover.html',
  styleUrl: './lint-popover.scss',
})
export class LintPopover {
  readonly finding = input.required<UiFinding>();
  /** How many findings share this paragraph. */
  readonly siblings = input(1);

  readonly swap = output<void>();
  readonly fixLine = output<void>();
  readonly ignore = output<void>();
}
