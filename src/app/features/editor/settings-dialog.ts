import { Component, type Signal, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

import { STYLE_RULES, type StyleRule } from '../../../shared/style-rules';
import { STYLE_PACKAGES } from '../../../shared/styles';
import { StyleSettings } from '../../core/style-settings';
import { analyzeReadability } from './readability';

export interface SettingsDialogData {
  /** Plain text of the current document, for the readability scores. */
  text: Signal<string>;
}

@Component({
  selector: 'nit-settings-dialog',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.scss',
})
export class SettingsDialog {
  protected readonly data = inject<SettingsDialogData>(MAT_DIALOG_DATA);
  protected readonly settings = inject(StyleSettings);

  protected readonly packages = STYLE_PACKAGES;
  protected readonly expanded = signal<string | null>(null);
  protected readonly report = computed(() => analyzeReadability(this.data.text()));

  protected rulesFor(id: string): readonly StyleRule[] {
    return STYLE_RULES[id] ?? [];
  }

  protected toggleExpanded(id: string): void {
    this.expanded.update((cur) => (cur === id ? null : id));
  }
}
