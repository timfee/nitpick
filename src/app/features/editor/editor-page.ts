import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { firstValueFrom } from 'rxjs';

import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';
import { StyleSettings } from '../../core/style-settings';
import { AccountMenu } from './account-menu';
import { EditorToolbar } from './editor-toolbar';
import {
  FixDialog,
  buildFixGroups,
  type FixDialogData,
  type FixDialogResult,
} from './fix-dialog';
import { FindingsPanel } from './findings-panel';
import { LintHighlight, lintRangeById } from './lint-highlight';
import { SettingsDialog, type SettingsDialogData } from './settings-dialog';
import { buildTextIndex, locateFindings, type UiFinding } from './text-index';

const SAMPLE = `
<h1>Nitpicker</h1>
<p>Type or paste your prose, then press <strong>Check prose</strong>. This paragraph has
problems on purpose:</p>
<p>It goes without saying that in order to utilize this editor, you should basically avoid
clichés like the plague. At this point in time, most drafts could of been tightened.</p>`;

@Component({
  selector: 'nit-editor-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
    TiptapEditorDirective,
    AccountMenu,
    EditorToolbar,
    FindingsPanel,
  ],
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.scss',
  host: {
    '(document:keydown.control.enter)': 'check()',
    '(document:keydown.meta.enter)': 'check()',
  },
})
export class EditorPage {
  private readonly api = inject(LintApi);
  private readonly auth = inject(Auth);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly styleSettings = inject(StyleSettings);

  protected readonly editor = signal<Editor | null>(null);
  protected readonly findings = signal<UiFinding[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly stale = signal(false);
  protected readonly words = signal(0);
  /** Flat document text, feeding the readability scores in settings. */
  private readonly plain = signal('');

  constructor() {
    afterNextRender(() => this.createEditor());
    inject(DestroyRef).onDestroy(() => this.editor()?.destroy());
  }

  private createEditor(): void {
    const editor = new Editor({
      extensions: [
        StarterKit,
        LintHighlight.configure({ onSelect: (id) => this.selectedId.set(id) }),
      ],
      content: SAMPLE,
      autofocus: 'end',
      onUpdate: ({ editor }) => {
        const text = editor.getText();
        this.plain.set(text);
        this.words.set(countWords(text));
        if (this.findings().length) this.stale.set(true);
      },
    });
    this.plain.set(editor.getText());
    this.words.set(countWords(editor.getText()));
    this.editor.set(editor);
  }

  protected async check(): Promise<void> {
    const editor = this.editor();
    if (!editor || this.checking()) return;

    const index = buildTextIndex(editor.state.doc);
    if (!index.text.trim()) return;

    this.checking.set(true);
    try {
      const report = await this.api.check(index.text, this.styleSettings.selections());
      const located = locateFindings(report.findings, buildTextIndex(editor.state.doc));
      this.findings.set(located.map((l) => l.finding));
      this.selectedId.set(null);
      this.stale.set(false);
      editor.commands.setLintRanges(located.map((l) => l.range));
    } catch (err) {
      this.handleError(err);
    } finally {
      this.checking.set(false);
    }
  }

  protected select(id: string): void {
    const editor = this.editor();
    if (!editor) return;
    this.selectedId.set(id);
    editor.commands.selectLintRange(id);
    const range = lintRangeById(editor.state, id);
    if (range) editor.chain().focus().setTextSelection(range.from).scrollIntoView().run();
  }

  protected apply(finding: UiFinding): void {
    const editor = this.editor();
    if (!editor) return;
    const range = lintRangeById(editor.state, finding.id);
    if (!range) {
      this.snackBar.open('That passage changed — run the check again.', undefined, {
        duration: 4000,
      });
      return;
    }
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.insertText(finding.suggestion, range.from, range.to);
        return true;
      })
      .run();
    this.dismiss(finding);
  }

  protected dismiss(finding: UiFinding): void {
    this.editor()?.commands.removeLintRange(finding.id);
    this.findings.update((list) => list.filter((f) => f.id !== finding.id));
    if (this.selectedId() === finding.id) this.selectedId.set(null);
  }

  protected openSettings(): void {
    this.dialog.open<SettingsDialog, SettingsDialogData>(SettingsDialog, {
      data: { text: this.plain },
      width: 'min(40rem, calc(100vw - 2rem))',
      maxWidth: 'none',
      autoFocus: 'dialog',
    });
  }

  protected async fixAll(): Promise<void> {
    const editor = this.editor();
    if (!editor) return;
    const groups = buildFixGroups(editor.state, this.findings());
    if (!groups.length) {
      this.snackBar.open('The text changed — run the check again.', undefined, { duration: 4000 });
      return;
    }
    const ref = this.dialog.open<FixDialog, FixDialogData, FixDialogResult>(FixDialog, {
      data: { editor, groups, onResolved: (ids) => this.resolve(ids) },
      width: 'min(46rem, calc(100vw - 2rem))',
      maxWidth: 'none',
      autoFocus: 'dialog',
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result?.approved) {
      const noun = result.approved === 1 ? 'issue' : 'issues';
      this.snackBar.open(`Fixed ${result.approved} ${noun}.`, undefined, { duration: 4000 });
    }
  }

  private resolve(ids: string[]): void {
    const gone = new Set(ids);
    this.findings.update((list) => list.filter((f) => !gone.has(f.id)));
    const selected = this.selectedId();
    if (selected && gone.has(selected)) this.selectedId.set(null);
  }

  private handleError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.snackBar.open('Session expired — sign in again.', undefined, { duration: 4000 });
      this.auth.signOut();
      return;
    }
    const body = err instanceof HttpErrorResponse ? (err.error as { error?: unknown }) : null;
    const detail = typeof body?.error === 'string' ? body.error : 'Lint check failed — try again.';
    this.snackBar.open(detail, undefined, { duration: 5000 });
  }
}

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;
