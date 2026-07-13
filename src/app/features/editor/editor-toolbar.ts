import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
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
  /** Kept visible in the panning strip even at compact widths. */
  essential?: true;
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

const undoTool: Tool = {
  icon: 'undo',
  tip: 'Undo',
  exec: (c) => c.undo(),
  can: (e) => e.can().undo(),
  essential: true,
};
const redoTool: Tool = {
  icon: 'redo',
  tip: 'Redo',
  exec: (c) => c.redo(),
  can: (e) => e.can().redo(),
  essential: true,
};
const essentialDivider: Divider = { divider: true };
const boldTool: Tool = {
  icon: 'format_bold',
  tip: 'Bold',
  exec: (c) => c.toggleBold(),
  active: ['bold'],
};
const italicTool: Tool = {
  icon: 'format_italic',
  tip: 'Italic',
  exec: (c) => c.toggleItalic(),
  active: ['italic'],
};

const TOOLS: ToolbarItem[] = [
  undoTool,
  redoTool,
  essentialDivider,
  boldTool,
  italicTool,
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
  { icon: 'horizontal_rule', tip: 'Horizontal rule', exec: (c) => c.setHorizontalRule() },
];

/** The strip that stays visible at compact widths — undo/redo plus the most-used marks. */
// At compact widths the app bar's fixed controls leave ~140px for this strip;
// undo/redo plus the overflow kebab is what genuinely fits without panning.
const ESSENTIAL_TOOLS: ToolbarItem[] = [undoTool, redoTool];

/**
 * Everything else, reachable through the overflow menu at compact widths. A
 * flat menu has no use for the dividers that group the panning strip.
 */
const OVERFLOW_TOOLS: (Tool | LinkAction)[] = TOOLS.filter(
  (item): item is Tool | LinkAction => !isDivider(item) && (isLinkAction(item) || !item.essential),
);

@Component({
  selector: 'nit-editor-toolbar',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  host: {
    '(scroll)': 'updatePan()',
    '[class.fade-start]': 'canLeft()',
    '[class.fade-end]': 'canRight()',
  },
  template: `
    @for (item of visibleTools(); track $index) {
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
    @if (compact()) {
      <button matIconButton matTooltip="More formatting" aria-label="More formatting" [matMenuTriggerFor]="more">
        <mat-icon>more_horiz</mat-icon>
      </button>
      <mat-menu #more="matMenu" class="nit-toolbar-more">
        @for (item of overflowTools; track $index) {
          @if (isLinkAction(item)) {
            <button mat-menu-item [disabled]="isLinkDisabled()" (click)="toggleLink()">
              <mat-icon>link</mat-icon>
              Link
            </button>
          } @else {
            <button mat-menu-item [class.active]="isOn(item)" [disabled]="isDisabled(item)" (click)="run(item)">
              <mat-icon>{{ item.icon }}</mat-icon>
              {{ item.tip }}
            </button>
          }
        }
      </mat-menu>
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
      // The fade is the affordance that the strip continues; it only renders
      // on the side that actually has more content, so a strip that fits
      // entirely on-screen shows no fade at all.
      &.fade-end {
        mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent);
      }
      &.fade-start {
        mask-image: linear-gradient(to right, transparent, black 2rem);
      }
      &.fade-start.fade-end {
        mask-image: linear-gradient(
          to right,
          transparent,
          black 2rem,
          black calc(100% - 2rem),
          transparent
        );
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
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Bumped on every transaction so tool state stays reactive without zones. */
  private readonly tick = signal(0);

  /** Whether the strip has more content off-screen to the left/right. */
  protected readonly canLeft = signal(false);
  protected readonly canRight = signal(false);

  /** Below this width, only essential tools show inline; the rest move into the overflow menu. */
  protected readonly compact = signal(false);
  protected readonly overflowTools = OVERFLOW_TOOLS;
  protected readonly visibleTools = computed(() => (this.compact() ? ESSENTIAL_TOOLS : TOOLS));

  constructor() {
    effect((onCleanup) => {
      const editor = this.editor();
      const bump = () => this.tick.update((t) => t + 1);
      editor.on('transaction', bump);
      onCleanup(() => editor.off('transaction', bump));
    });

    afterNextRender(() => {
      const el = this.elementRef.nativeElement;
      this.updatePan();
      const observer = new ResizeObserver(() => this.updatePan());
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());

      const query = matchMedia('(max-width: 40rem)');
      this.compact.set(query.matches);
      const onChange = (e: MediaQueryListEvent) => this.compact.set(e.matches);
      query.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
    });
  }

  /** Recomputes which edges still have unscrolled content, for the fade cue. */
  protected updatePan(): void {
    const el = this.elementRef.nativeElement;
    this.canLeft.set(el.scrollLeft > 0);
    this.canRight.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
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
