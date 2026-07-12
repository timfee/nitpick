import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface LinkDialogData {
  /** Existing link href when editing, empty string when adding a new link. */
  href: string;
}

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** Small Material dialog collecting a single URL for the editor's link tool. */
@Component({
  selector: 'nit-link-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  templateUrl: './link-dialog.html',
  styleUrl: './link-dialog.scss',
})
export class LinkDialog {
  private readonly data = inject<LinkDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<LinkDialog, string>>(MatDialogRef);

  protected readonly url = signal(this.data.href);

  protected setUrl(value: string): void {
    this.url.set(value);
  }

  /** Closes with the normalized href, or with nothing when the input is blank. */
  protected confirm(): void {
    const value = this.url().trim();
    if (!value) {
      this.ref.close();
      return;
    }
    this.ref.close(HAS_SCHEME.test(value) ? value : `https://${value}`);
  }
}
