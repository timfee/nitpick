import { Component, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { ReadabilityGrade, ReadabilityReport } from './readability';

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

  /** Hovercard for a grade-level metric: "<label> — <hint>. <Range>." */
  gradeTooltip(g: ReadabilityGrade): string {
    return `${g.label} — ${lowerFirst(g.hint)}. ${capitalize(g.range)}.`;
  }

  /** Hovercard for Flesch reading ease: "Flesch reading ease — <verdict>. <Range>." */
  easeTooltip(r: ReadabilityReport): string {
    return `Flesch reading ease — ${r.ease.verdict}. ${capitalize(r.ease.range)}.`;
  }
}

/** Lowercases the leading word unless it's an acronym (e.g. "US school..."). */
function lowerFirst(s: string): string {
  return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
