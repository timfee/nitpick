import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SuggestionChip } from './suggestion-chip';
import type { UiFinding } from './text-index';

@Component({
  selector: 'nit-findings-panel',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule, SuggestionChip],
  templateUrl: './findings-panel.html',
  styleUrl: './findings-panel.scss',
})
export class FindingsPanel {
  readonly findings = input.required<UiFinding[]>();
  readonly selectedId = input<string | null>(null);
  readonly stale = input(false);

  readonly selectFinding = output<string>();
  readonly applyFinding = output<UiFinding>();
  readonly dismissFinding = output<UiFinding>();
  readonly fixAll = output<void>();
}
