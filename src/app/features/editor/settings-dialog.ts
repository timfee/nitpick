import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatListModule, type MatSelectionListChange } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';

import { STYLE_RULES, type StyleRule } from '../../../shared/style-rules';
import { STYLE_PACKAGES } from '../../../shared/styles';
import { StyleSettings } from '../../core/style-settings';

@Component({
  selector: 'nit-settings-dialog',
  imports: [MatButtonModule, MatDialogModule, MatListModule, MatTooltipModule],
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

  protected onRuleToggle(pkgId: string, change: MatSelectionListChange): void {
    for (const option of change.options) {
      this.settings.setRule(pkgId, option.value as string, option.selected);
    }
  }
}
