import { Component, effect, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor, type ChainedCommands } from '@tiptap/core';

interface Tool {
  icon: string;
  tip: string;
  exec: (chain: ChainedCommands) => ChainedCommands;
  /** Mark/node name (with optional attrs) that renders this tool as active. */
  active?: [name: string, attrs?: Record<string, unknown>];
  /** When set, the tool is disabled unless this returns true. */
  can?: (editor: Editor) => boolean;
}

/** A thin visual break between related groups of tools. */
interface Divider {
  divider: true;
}

type ToolbarItem = Tool | Divider;

const isDivider = (item: ToolbarItem): item is Divider => 'divider' in item;

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
      display: contents;
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
      margin-inline: 0.125rem;
    }
  `,
})
export class EditorToolbar {
  readonly editor = input.required<Editor>();

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
}
