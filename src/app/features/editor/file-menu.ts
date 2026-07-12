import { Component, type ElementRef, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';

/** Kebab-case slug from the first heading or first line, used as the download filename. */
function slugify(markdown: string): string {
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
 * Toolbar menu for markdown import/export. Dumb by design: the editor comes
 * in as a signal input, and a successful import is reported via `imported`
 * so the page can reset lint state (findings point at text that's now gone).
 */
@Component({
  selector: 'nit-file-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: './file-menu.html',
  styleUrl: './file-menu.scss',
})
export class FileMenu {
  readonly editor = input.required<Editor>();
  readonly imported = output<void>();

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

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
}
