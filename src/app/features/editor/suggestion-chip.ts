import { Component } from '@angular/core';

/**
 * Arrow-led pill for a suggested replacement. The surrounding surface's
 * container tone varies by call site, so it's overridable via
 * `--nit-suggestion-chip-surface`.
 */
@Component({
  selector: 'nit-suggestion-chip',
  template: `<span class="arrow" aria-hidden="true">→</span><ng-content />`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      width: auto;
      border-radius: 0.375rem;
      padding: 0.125rem 0.5rem;
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
      background: var(--nit-suggestion-chip-surface, var(--mat-sys-surface-container-high));
    }
    .arrow {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class SuggestionChip {}
