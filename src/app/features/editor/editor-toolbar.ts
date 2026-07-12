import { Component, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor, type ChainedCommands } from '@tiptap/core';

import { LinkDialog, type LinkDialogData } from './link-dialog';

interface Tool {
  icon: string;
  tip: string;
  exec: (chain: ChainedCommands) => ChainedCommands;
  /** Mark/node name (with optional attrs) that renders this tool as active. */
  active?: [name: string, attrs?: Record<string, unknown>];
  /** When set, the tool stays disabled unless this returns true. */
  can?: (editor: Editor) => boolean;
}

/** A thin visual break between related groups of tools. */
interface Divider {
  divider: true;
}

/**
 * Marker for the link button: setting a link needs a URL from the user, so it
 * can't fit the synchronous `exec` pattern every other tool uses. Handled as
 * a one-off case in the template instead of contorting `Tool`.
 */
interface LinkAction {
  link: true;
}

type ToolbarItem = Tool | Divider | LinkAction;

const isDivider = (item: ToolbarItem): item is Divider => 'divider' in item;
const isLinkAction = (item: ToolbarItem): item is LinkAction => 'link' in item;

const TOOLS: ToolbarItem[] = [
  { icon: 'undo', tip: 'Undo', exec: (c) => c.undo(), can: (e) => e.can().undo() },
  { icon: 'redo', tip: 'Redo', exec: (c) => c.redo(), can: (e) => e.can().redo() },
  { divider: true },
  { icon: 'format_bold', tip: 'Bold', exec: (c) => c.toggleBold(), active: ['bold'] },
  { icon: 'format_italic', tip: 'Italic', exec: (c) => c.toggleItalic(), active: ['italic'] },
  {
    icon: 'strikethrough_s',
    tip: 'Strikethrough',
    exec: (c) => c.toggleStrike(),
    active: ['strike'],
  },
  {
    icon: 'code',
    tip: 'Inline code',
    exec: (c) => c.toggleCode(),
    active: ['code'],
  },
  { link: true },
  { divider: true },
  {
    icon: 'format_h1',
    tip: 'Heading 1',
    exec: (c) => c.toggleHeading({ level: 1 }),
    active: ['heading', { level: 1 }],
  },
  {
    icon: 'format_h2',
    tip: 'Heading 2',
    exec: (c) => c.toggleHeading({ level: 2 }),
    active: ['heading', { level: 2 }],
  },
  {
    icon: 'format_h3',
    tip: 'Heading 3',
    exec: (c) => c.toggleHeading({ level: 3 }),
    active: ['heading', { level: 3 }],
  },
  { divider: true },
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
  {
    icon: 'checklist',
    tip: 'Task list',
    exec: (c) => c.toggleTaskList(),
    active: ['taskList'],
  },
  { icon: 'format_quote', tip: 'Quote', exec: (c) => c.toggleBlockquote(), active: ['blockquote'] },
  {
    icon: 'code_blocks',
    tip: 'Code block',
    exec: (c) => c.toggleCodeBlock(),
    active: ['codeBlock'],
  },
  { divider: true },
  { icon: 'horizontal_rule', tip: 'Horizontal rule', exec: (c) => c.setHorizontalRule() },
];

@Component({
  selector: 'nit-editor-toolbar',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @for (item of tools; track $index) {
      @if (isDivider(item)) {
        <span class="divider"></span>
      } @else if (isLinkAction(item)) {
        <button
          matIconButton
          matTooltip="Link"
          aria-label="Link"
          [class.active]="isLinkActive()"
          [disabled]="isLinkDisabled()"
          (click)="toggleLink()"
        >
          <mat-icon>link</mat-icon>
        </button>
      } @else {
        <button
          matIconButton
          [matTooltip]="item.tip"
          [attr.aria-label]="item.tip"
          [class.active]="isOn(item)"
          [disabled]="isDisabled(item)"
          (click)="run(item)"
        >
          <mat-icon>{{ item.icon }}</mat-icon>
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      overflow-x: auto;
      // Material's invisible 48px touch targets poke past the 40px buttons
      // and would keep this strip permanently scrollable by 4px; turn them
      // off at the source rather than padding around the overhang.
      --mat-icon-button-touch-target-display: none;
      // The strip pans on overflow; a scrollbar under icon buttons reads as
      // broken chrome, so hide it (wheel, drag, and tab-to-focus still scroll).
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }
    }
    button {
      flex-shrink: 0;
    }
    .active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .divider {
      inline-size: 1px;
      block-size: 1.5rem;
      align-self: center;
      background: var(--mat-sys-outline-variant);
      // Toolbar gap is 0.5rem; adding another 0.5rem here makes the gutter
      // around a divider read as ~1rem, distinct from the 0.5rem within a
      // tool group.
      margin-inline: 0.5rem;
      flex-shrink: 0;
    }
  `,
})
export class EditorToolbar {
  readonly editor = input.required<Editor>();

  private readonly dialog = inject(MatDialog);

  protected readonly tools = TOOLS;
  /** Bumped on every transaction so tool state stays reactive without zones. */
  private readonly tick = signal(0);

  constructor() {
    effect((onCleanup) => {
      const editor = this.editor();
      const bump = () => this.tick.update((t) => t + 1);
      editor.on('transaction', bump);
      onCleanup(() => editor.off('transaction', bump));
    });
  }

  protected readonly isDivider = isDivider;
  protected readonly isLinkAction = isLinkAction;

  protected run(tool: Tool): void {
    tool.exec(this.editor().chain().focus()).run();
  }

  protected isOn(tool: Tool): boolean {
    this.tick();
    return !!tool.active && this.editor().isActive(tool.active[0], tool.active[1]);
  }

  protected isDisabled(tool: Tool): boolean {
    this.tick();
    return tool.can ? !tool.can(this.editor()) : false;
  }

  protected isLinkActive(): boolean {
    this.tick();
    return this.editor().isActive('link');
  }

  /** Nothing sensible to link when there's no selection and no link at the caret. */
  protected isLinkDisabled(): boolean {
    this.tick();
    const editor = this.editor();
    return editor.state.selection.empty && !editor.isActive('link');
  }

  protected toggleLink(): void {
    const editor = this.editor();
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    const href = (editor.getAttributes('link')['href'] as string | undefined) ?? '';
    this.dialog
      .open<LinkDialog, LinkDialogData, string>(LinkDialog, {
        data: { href },
        width: 'min(26rem, calc(100vw - 2rem))',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        editor.chain().focus().extendMarkRange('link').setLink({ href: result }).run();
      });
  }
}
