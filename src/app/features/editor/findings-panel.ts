import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { UiFinding } from './text-index';

@Component({
  selector: 'nit-findings-panel',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule],
  template: `
    <header>
      <h2 class="mat-title-medium">Findings</h2>
      @if (stale()) {
        <mat-icon matTooltip="Text changed since the last check">history</mat-icon>
      }
      <span class="count mat-label-large">{{ findings().length }}</span>
    </header>

    @if (!findings().length) {
      <p class="empty mat-body-medium">No findings. Run a check to see suggestions here.</p>
    }

    @for (f of findings(); track f.id) {
      <mat-card
        appearance="outlined"
        [class]="'severity-' + f.severity"
        [class.selected]="f.id === selectedId()"
        (click)="selectFinding.emit(f.id)"
      >
        <mat-card-header>
          <mat-card-title class="mat-label-medium">{{ f.category }}</mat-card-title>
          <button
            matIconButton
            matTooltip="Dismiss"
            aria-label="Dismiss finding"
            (click)="dismissFinding.emit(f); $event.stopPropagation()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </mat-card-header>
        <mat-card-content>
          <blockquote class="mat-body-medium">{{ f.quote }}</blockquote>
          <p class="mat-body-medium">{{ f.message }}</p>
          @if (f.suggestion) {
            <code class="mat-body-medium">{{ f.suggestion }}</code>
          }
        </mat-card-content>
        @if (f.suggestion) {
          <mat-card-actions align="end">
            <button matButton (click)="applyFinding.emit(f); $event.stopPropagation()">
              Apply
            </button>
          </mat-card-actions>
        }
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      overflow-y: auto;
      padding: 1rem;
    }
    header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      h2 {
        flex: 1;
        margin: 0;
      }
      .count {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        border-radius: 1rem;
        padding: 0.125rem 0.625rem;
      }
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
      padding: 2rem 1rem;
    }
    mat-card {
      cursor: pointer;
      --severity: var(--mat-sys-primary);
      border-inline-start: 3px solid var(--severity);
      &.severity-warning {
        --severity: var(--mat-sys-tertiary);
      }
      &.severity-error {
        --severity: var(--mat-sys-error);
      }
      &.selected {
        background: var(--mat-sys-surface-container-high);
      }
      mat-card-header {
        justify-content: space-between;
        align-items: center;
      }
      mat-card-title {
        color: var(--mat-sys-on-surface-variant);
      }
      blockquote {
        margin: 0.5rem 0;
        padding-inline-start: 0.625rem;
        border-inline-start: 2px solid var(--mat-sys-outline-variant);
        font-style: italic;
        color: var(--mat-sys-on-surface-variant);
        overflow-wrap: anywhere;
      }
      p {
        margin: 0;
      }
      code {
        display: block;
        margin-top: 0.5rem;
        background: var(--mat-sys-surface-container-high);
        border-radius: 0.25rem;
        padding: 0.25rem 0.5rem;
        overflow-wrap: anywhere;
      }
    }
  `,
})
export class FindingsPanel {
  readonly findings = input.required<UiFinding[]>();
  readonly selectedId = input<string | null>(null);
  readonly stale = input(false);

  readonly selectFinding = output<string>();
  readonly applyFinding = output<UiFinding>();
  readonly dismissFinding = output<UiFinding>();
}
