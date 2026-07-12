import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';

import { STYLE_RULES, type StyleRule } from '../../../shared/style-rules';
import { STYLE_PACKAGES } from '../../../shared/styles';
import { StyleSettings } from '../../core/style-settings';

@Component({
  selector: 'nit-settings-dialog',
  imports: [MatButtonModule, MatCheckboxModule, MatDialogModule, MatListModule],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.scss',
})
export class SettingsDialog {
  protected readonly settings = inject(StyleSettings);

  protected readonly packages = STYLE_PACKAGES;
  protected readonly selected = signal(STYLE_PACKAGES[0].id);
  protected readonly current = computed(() =>
    STYLE_PACKAGES.find((pkg) => pkg.id === this.selected()),
  );

  protected rulesFor(id: string): readonly StyleRule[] {
    return STYLE_RULES[id] ?? [];
  }
}
