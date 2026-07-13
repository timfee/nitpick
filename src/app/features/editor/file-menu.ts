import {
  Component,
  type ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Editor } from '@tiptap/core';

import { environment } from '../../../environments/environment';
import { Drive } from '../../core/drive';
import { DrivePicker } from '../../core/drive-picker';
import { LintApi } from '../../core/lint-api';

/**
 * Kebab-case slug from the first heading or first line. Used as the download
 * filename and, unqualified, as the default title for a new Google Doc.
 */
export function slugify(markdown: string): string {
  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const title = (firstLine ?? '').replace(/^#+\s*/, '');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

/**
 * Toolbar menu for markdown import/export and (when a Picker API key is
 * configured) Google Drive open/save. Dumb by design: the editor comes in as
 * a signal input, and a successful import reports through `imported` so the
 * page can reset lint state (findings point at text that's now gone).
 */
@Component({
  selector: 'nit-file-menu',
  imports: [MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule],
  templateUrl: './file-menu.html',
  styleUrl: './file-menu.scss',
})
export class FileMenu {
  readonly editor = input.required<Editor>();
  readonly imported = output<void>();

  private readonly api = inject(LintApi);
  private readonly drive = inject(Drive);
  private readonly picker = inject(DrivePicker);
  private readonly snackBar = inject(MatSnackBar);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /** Drive menu items only render once a Picker API key is actually configured. */
  protected readonly driveEnabled = signal(false);
  /** Guards against double-clicks while a Drive round trip is in flight. */
  protected readonly driveBusy = signal(false);

  constructor() {
    afterNextRender(() => void this.checkDriveEnabled());
  }

  private async checkDriveEnabled(): Promise<void> {
    try {
      // The build bakes the key in for most deployments. The API call is a
      // fallback for setups configured purely through environment variables,
      // matching the OAuth client ID pattern in sign-in-page.ts.
      const apiKey = environment.googleApiKey || (await this.api.config()).apiKey;
      this.driveEnabled.set(!!apiKey);
    } catch {
      this.driveEnabled.set(false);
    }
  }

  protected triggerImport(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    this.editor().commands.setContent(text, { contentType: 'markdown' });
    this.imported.emit();
  }

  protected download(): void {
    const markdown = this.editor().getMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slugify(markdown)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected async openFromDrive(): Promise<void> {
    if (this.driveBusy()) return;
    this.driveBusy.set(true);
    try {
      const picked = await this.picker.pickDocument();
      if (!picked) return;
      const markdown = await this.drive.exportDocAsMarkdown(picked.id);
      this.editor().commands.setContent(markdown, { contentType: 'markdown' });
      this.imported.emit();
      this.drive.remember(picked.id, picked.name);
      this.notify(`Opened ${picked.name} from Drive.`);
    } catch (err) {
      this.driveError(err);
    } finally {
      this.driveBusy.set(false);
    }
  }

  protected async saveToDrive(): Promise<void> {
    if (this.driveBusy()) return;
    this.driveBusy.set(true);
    try {
      const markdown = this.editor().getMarkdown();
      const remembered = this.drive.remembered();
      const name = remembered?.name ?? slugify(markdown);
      const fileId = await this.drive.saveMarkdownAsDoc(name, markdown, remembered?.fileId);
      this.drive.remember(fileId, name);
      this.notify(`Saved to Drive as ${name}.`);
    } catch (err) {
      this.driveError(err);
    } finally {
      this.driveBusy.set(false);
    }
  }

  private driveError(err: unknown): void {
    console.error('[drive]', err);
    this.notify('Google Drive said no. Try again.');
  }

  /** Transient toast with no action button. */
  private notify(message: string): void {
    this.snackBar.open(message, undefined, { duration: 4000 });
  }
}
