import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { UiFinding } from './text-index';

@Component({
  selector: 'nit-findings-panel',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <header>
      <h2>Findings</h2>
      @if (stale()) {
        <mat-icon class="stale" matTooltip="Text changed since the last check">history</mat-icon>
      }
      <span class="spacer"></span>
      <span class="count">{{ findings().length }}</span>
    </header>

    @if (!findings().length) {
      <div class="empty">
        <mat-icon>task_alt</mat-icon>
        <p>No findings. Run a check to see suggestions here.</p>
      </div>
    }

    @for (f of findings(); track f.id) {
      <article
        class="finding"
        [class.selected]="f.id === selectedId()"
        [attr.data-severity]="f.severity"
        (click)="selectFinding.emit(f.id)"
      >
        <div class="meta">
          <span class="dot"></span>
          <span class="category">{{ f.category }}</span>
          <span class="spacer"></span>
          <button
            matIconButton
            matTooltip="Dismiss"
            (click)="dismissFinding.emit(f); $event.stopPropagation()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <blockquote>{{ f.quote }}</blockquote>
        <p class="message">{{ f.message }}</p>
        @if (f.suggestion) {
          <div class="fix">
            <code>{{ f.suggestion }}</code>
            <button matButton="tonal" (click)="applyFinding.emit(f); $event.stopPropagation()">
              <mat-icon>done</mat-icon>
              Apply
            </button>
          </div>
        }
      </article>
    }
  `,
  styleUrl: './findings-panel.scss',
})
export class FindingsPanel {
  readonly findings = input.required<UiFinding[]>();
  readonly selectedId = input<string | null>(null);
  readonly stale = input(false);

  readonly selectFinding = output<string>();
  readonly applyFinding = output<UiFinding>();
  readonly dismissFinding = output<UiFinding>();
}
