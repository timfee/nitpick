import { Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ReadabilityReport } from './readability';

/**
 * Bottom status bar: the live word count plus, once there is enough text,
 * the readability scores. Optional stats collapse on narrow viewports.
 */
@Component({
  selector: 'nit-status-bar',
  imports: [MatTooltipModule],
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.scss',
})
export class StatusBar {
  readonly words = input.required<number>();
  readonly readability = input<ReadabilityReport | null>(null);
}
