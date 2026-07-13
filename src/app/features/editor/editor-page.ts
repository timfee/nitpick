import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  type ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import type { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { TiptapEditorDirective } from 'ngx-tiptap';
import { firstValueFrom } from 'rxjs';

import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';
import { StyleSettings } from '../../core/style-settings';
import { AccountMenu } from './account-menu';
import { blockStart, buildFixGroups, type FixGroup } from './blocks';
import { EditorToolbar } from './editor-toolbar';
import { FileMenu } from './file-menu';
import { FixDialog, type FixDialogData } from './fix-dialog';
import { FindingsPanel } from './findings-panel';
import { LintHighlight, lintRangeById } from './lint-highlight';
import { LintPopover } from './lint-popover';
import { analyzeReadability } from './readability';
import { SettingsDialog } from './settings-dialog';
import { StatusBar } from './status-bar';
import { buildTextIndex, locateFindings, type UiFinding } from './text-index';

interface PopoverState {
  finding: UiFinding;
  siblings: number;
  x: number;
  y: number;
}

const POPOVER_WIDTH = 320;

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
    FileMenu,
    FindingsPanel,
    LintPopover,
    StatusBar,
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
  /** Flat document text, feeding the readability scores. */
  private readonly plain = signal('');
  protected readonly words = computed(() => countWords(this.plain()));
  protected readonly readability = computed(() => analyzeReadability(this.plain()));

  private readonly main = viewChild<ElementRef<HTMLElement>>('main');
  /** Bumped per transaction so the popover tracks its highlight. */
  private readonly tick = signal(0);
  protected readonly popover = computed(() => this.computePopover());

  constructor() {
    afterNextRender(() => this.createEditor());
    inject(DestroyRef).onDestroy(() => this.editor()?.destroy());
  }

  /** Anchors the popover under the selected highlight, in scroll-content coordinates. */
  private computePopover(): PopoverState | null {
    this.tick();
    const editor = this.editor();
    const id = this.selectedId();
    const host = this.main()?.nativeElement;
    if (!editor || !id || !host) return null;
    const finding = this.findings().find((f) => f.id === id);
    const range = finding && lintRangeById(editor.state, finding.id);
    if (!finding || !range) return null;

    const coords = editor.view.coordsAtPos(range.from);
    const rect = host.getBoundingClientRect();
    const x = Math.max(
      8,
      Math.min(coords.left - rect.left + host.scrollLeft, host.clientWidth - POPOVER_WIDTH - 8),
    );
    const y = coords.bottom - rect.top + host.scrollTop + 8;
    return { finding, siblings: this.siblingCount(editor.state, range.from), x, y };
  }

  /** How many findings sit in the same paragraph as `pos`. */
  private siblingCount(state: EditorState, pos: number): number {
    const block = blockStart(state, pos);
    return this.findings().filter((f) => {
      const range = lintRangeById(state, f.id);
      return range && blockStart(state, range.from) === block;
    }).length;
  }

  private createEditor(): void {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          // Clicking a link while editing should place the cursor, not navigate.
          link: { openOnClick: false, defaultProtocol: 'https' },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Markdown,
        LintHighlight.configure({ onSelect: (id) => this.selectedId.set(id) }),
      ],
      content: SAMPLE,
      autofocus: 'end',
      onTransaction: () => this.tick.update((t) => t + 1),
      onUpdate: ({ editor }) => {
        const text = editor.getText();
        this.plain.set(text);
        if (this.findings().length) this.stale.set(true);
      },
    });
    this.plain.set(editor.getText());
    this.editor.set(editor);
  }

  protected async check(): Promise<void> {
    const editor = this.editor();
    if (!editor || this.checking()) return;

    const index = buildTextIndex(editor.state.doc);
    if (!index.text.trim()) return;

    const styles = this.styleSettings.selections();
    if (!styles.length) {
      this.notify('All style packages are off. Turn some on in settings.');
      return;
    }

    this.checking.set(true);
    try {
      const report = await this.api.check(index.text, styles);
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
      this.notify('That passage changed. Run the check again.');
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

  /** After a markdown import, prior findings no longer point at real text. */
  protected onImported(): void {
    const editor = this.editor();
    if (!editor) return;
    this.findings.set([]);
    this.selectedId.set(null);
    this.stale.set(false);
    editor.commands.setLintRanges([]);
  }

  protected openSettings(): void {
    // Compact viewports get a full-screen sheet instead of a floating card —
    // there isn't room for a centered dialog with a side rail.
    if (matchMedia('(max-width: 40rem)').matches) {
      this.dialog.open(SettingsDialog, {
        width: '100dvw',
        height: '100dvh',
        maxWidth: 'none',
        autoFocus: 'dialog',
        panelClass: 'fullscreen',
      });
      return;
    }
    this.dialog.open(SettingsDialog, {
      width: 'min(48rem, calc(100vw - 2rem))',
      maxWidth: 'none',
      autoFocus: 'dialog',
    });
  }

  protected fixAll(): void {
    const editor = this.editor();
    if (!editor) return;
    void this.openFixDialog(editor, buildFixGroups(editor.state, this.findings()));
  }

  /** Runs the fix workflow on just the paragraph holding `finding`. */
  protected fixLine(finding: UiFinding): void {
    const editor = this.editor();
    if (!editor) return;
    const groups = buildFixGroups(editor.state, this.findings()).filter((g) =>
      g.findings.some((f) => f.id === finding.id),
    );
    this.selectedId.set(null);
    void this.openFixDialog(editor, groups);
  }

  private async openFixDialog(editor: Editor, groups: FixGroup[]): Promise<void> {
    if (!groups.length) {
      this.notify('The text changed. Run the check again.');
      return;
    }
    // Counted here, not from the dialog result, so closing mid-flow with
    // Escape still reports (and can undo) what was already accepted.
    let fixed = 0;
    let undoSteps = 0;
    const ref = this.dialog.open<FixDialog, FixDialogData>(FixDialog, {
      data: {
        editor,
        groups,
        onResolved: (ids) => {
          this.resolve(ids);
          fixed += ids.length;
          undoSteps += 1;
        },
      },
      width: 'min(46rem, calc(100vw - 2rem))',
      maxWidth: 'none',
      autoFocus: 'dialog',
    });
    await firstValueFrom(ref.afterClosed());
    if (!fixed) return;
    const noun = fixed === 1 ? 'issue' : 'issues';
    const snack = this.snackBar.open(`Fixed ${fixed} ${noun}.`, 'Undo', { duration: 6000 });
    snack.onAction().subscribe(() => {
      for (let i = 0; i < undoSteps; i++) editor.commands.undo();
      // The reverted passages have no highlights anymore; flag the results
      // as stale so the sidebar points at a fresh check.
      this.stale.set(true);
    });
  }

  private resolve(ids: string[]): void {
    const gone = new Set(ids);
    this.findings.update((list) => list.filter((f) => !gone.has(f.id)));
    const selected = this.selectedId();
    if (selected && gone.has(selected)) this.selectedId.set(null);
  }

  private handleError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.notify('Session expired. Sign in again.');
      this.auth.signOut();
      return;
    }
    const body = err instanceof HttpErrorResponse ? (err.error as { error?: unknown }) : null;
    const detail = typeof body?.error === 'string' ? body.error : 'Lint check failed. Try again.';
    this.notify(detail, 5000);
  }

  /** Transient toast with no action button. */
  private notify(message: string, duration = 4000): void {
    this.snackBar.open(message, undefined, { duration });
  }
}

const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;
