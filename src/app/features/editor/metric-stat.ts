import { Component, ElementRef, inject, input, output } from '@angular/core';

/**
 * One status-bar metric: a label plus its value, shown plain when the score
 * is on target and as a colored badge otherwise. Hovering or focusing it
 * opens the parent's hovercard, anchored to this element.
 */
@Component({
  selector: 'nit-metric-stat',
  template: `
    {{ label() }}
    @if (status() === 'ok') {
      <b>{{ value() }}</b>
    } @else {
      <b class="badge" [class.severe]="status() === 'severe'">{{ value() }}</b>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.25ch;
    }
    b {
      font-weight: var(--mat-sys-title-medium-weight);
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface);
    }
    .badge {
      color: var(--mat-sys-on-tertiary-container);
      background: var(--mat-sys-tertiary-container);
      border-radius: 0.25rem;
      padding: 0.0625rem 0.375rem;
      &.severe {
        color: var(--mat-sys-on-error-container);
        background: var(--mat-sys-error-container);
      }
    }
  `,
  host: {
    tabindex: '0',
    class: 'stat metric',
    '(mouseenter)': 'show.emit(host.nativeElement)',
    '(focus)': 'show.emit(host.nativeElement)',
    '(mouseleave)': 'hide.emit()',
    '(blur)': 'hide.emit()',
    '(keydown.escape)': 'hide.emit()',
    '[attr.aria-describedby]': 'describedBy()',
  },
})
export class MetricStat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly status = input.required<'ok' | 'high' | 'severe'>();
  readonly describedBy = input<string | null>(null);

  readonly show = output<HTMLElement>();
  readonly hide = output<void>();

  protected readonly host = inject(ElementRef<HTMLElement>);
}
