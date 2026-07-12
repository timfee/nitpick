import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor, type ChainedCommands } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TiptapEditorDirective } from 'ngx-tiptap';

import { Auth } from '../../core/auth';
import { LintApi } from '../../core/lint-api';
import { FindingsPanel } from './findings-panel';
import { LintHighlight, lintRangeById } from './lint-highlight';
import { buildTextIndex, locateFindings, type UiFinding } from './text-index';

interface Tool {
  icon: string;
  tip: string;
  exec: (chain: ChainedCommands) => ChainedCommands;
  /** Mark/node name (with optional attrs) that renders this tool as active. */
  active?: [name: string, attrs?: Record<string, unknown>];
  /** When set, the tool is disabled unless this returns true. */
  can?: (editor: Editor) => boolean;
}

const TOOLS: Tool[] = [
  { icon: 'undo', tip: 'Undo', exec: (c) => c.undo(), can: (e) => e.can().undo() },
  { icon: 'redo', tip: 'Redo', exec: (c) => c.redo(), can: (e) => e.can().redo() },
  { icon: 'format_bold', tip: 'Bold', exec: (c) => c.toggleBold(), active: ['bold'] },
  { icon: 'format_italic', tip: 'Italic', exec: (c) => c.toggleItalic(), active: ['italic'] },
  {
    icon: 'strikethrough_s',
    tip: 'Strikethrough',
    exec: (c) => c.toggleStrike(),
    active: ['strike'],
  },
  {
    icon: 'format_h2',
    tip: 'Heading',
    exec: (c) => c.toggleHeading({ level: 2 }),
    active: ['heading', { level: 2 }],
  },
  {
    icon: 'format_list_bulleted',
    tip: 'Bullet list',
    exec: (c) => c.toggleBulletList(),
    active: ['bulletList'],
  },
  {
    icon: 'format_list_numbered',
    tip: 'Numbered list',
    exec: (c) => c.toggleOrderedList(),
    active: ['orderedList'],
  },
  { icon: 'format_quote', tip: 'Quote', exec: (c) => c.toggleBlockquote(), active: ['blockquote'] },
];

const SAMPLE = `
<h1>Nitpick</h1>
<p>Type or paste your prose, then press <strong>Check prose</strong>. This paragraph has
problems on purpose:</p>
<p>It goes without saying that in order to utilize this editor, you should basically avoid
clichés like the plague. At this point in time, most drafts could of been tightened.</p>`;

@Component({
  selector: 'nit-editor-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
    TiptapEditorDirective,
    FindingsPanel,
  ],
  templateUrl: './editor-page.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
    }
    mat-toolbar {
      gap: 0.25rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        margin-inline-end: 1rem;
      }
      .active {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }
      .spacer {
        flex: 1;
      }
      .words {
        color: var(--mat-sys-on-surface-variant);
        margin-inline-end: 0.75rem;
        white-space: nowrap;
      }
      .avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        vertical-align: middle;
      }
    }
    .menu-user {
      display: flex;
      flex-direction: column;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      small {
        color: var(--mat-sys-on-surface-variant);
      }
    }
    .body {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr minmax(18rem, 24rem);
      min-height: 0;
      @media (max-width: 60rem) {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr minmax(10rem, 40dvh);
      }
    }
    main {
      overflow-y: auto;
      padding: 2rem 1.5rem;
      display: grid;
    }
    nit-findings-panel {
      border-inline-start: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-low);
      min-height: 0;
    }
  `,
  host: {
    '(document:keydown.control.enter)': 'check()',
    '(document:keydown.meta.enter)': 'check()',
  },
})
export class EditorPage {
  private readonly api = inject(LintApi);
  private readonly auth = inject(Auth);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly user = this.auth.user;
  protected readonly editor = signal<Editor | null>(null);
  protected readonly findings = signal<UiFinding[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly stale = signal(false);
  protected readonly words = signal(0);
  /** Bumped on every transaction so toolbar state stays reactive without zones. */
  protected readonly tick = signal(0);

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
        this.words.set(countWords(editor.getText()));
        if (this.findings().length) this.stale.set(true);
      },
      onTransaction: () => this.tick.update((t) => t + 1),
    });
    this.words.set(countWords(editor.getText()));
    this.editor.set(editor);
  }

  protected readonly tools = TOOLS;

  protected run(tool: Tool): void {
    const editor = this.editor();
    if (editor) tool.exec(editor.chain().focus()).run();
  }

  protected isOn(tool: Tool): boolean {
    this.tick();
    const editor = this.editor();
    return !!editor && !!tool.active && editor.isActive(tool.active[0], tool.active[1]);
  }

  protected isDisabled(tool: Tool): boolean {
    this.tick();
    const editor = this.editor();
    return !editor || (tool.can ? !tool.can(editor) : false);
  }

  protected async check(): Promise<void> {
    const editor = this.editor();
    if (!editor || this.checking()) return;

    const index = buildTextIndex(editor.state.doc);
    if (!index.text.trim()) return;

    this.checking.set(true);
    try {
      const report = await this.api.check(index.text);
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

  protected signOut(): void {
    this.auth.signOut();
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
