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

@Component({
  selector: 'nit-editor-toolbar',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @for (tool of tools; track tool.icon) {
      <button
        matIconButton
        [matTooltip]="tool.tip"
        [attr.aria-label]="tool.tip"
        [class.active]="isOn(tool)"
        [disabled]="isDisabled(tool)"
        (click)="run(tool)"
      >
        <mat-icon>{{ tool.icon }}</mat-icon>
      </button>
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
