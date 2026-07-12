import type { Node as PmNode } from '@tiptap/pm/model';

import type { LintFinding } from '../../../shared/lint';
import type { LintRange } from './lint-highlight';

export interface UiFinding extends LintFinding {
  id: string;
}

export interface Located {
  finding: UiFinding;
  range: LintRange;
}

/**
 * Flattens the document to plain text (blocks joined by `\n`) while recording
 * where each text node sits, so a character offset in the flat text can be
 * mapped back to a ProseMirror position.
 */
export function buildTextIndex(doc: PmNode) {
  let text = '';
  const spans: { start: number; len: number; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      spans.push({ start: text.length, len: node.text.length, pos });
      text += node.text;
    } else if (node.isBlock && text && !text.endsWith('\n')) {
      text += '\n';
    }
    return true;
  });

  const posAt = (offset: number): number => {
    for (const s of spans) {
      if (offset >= s.start && offset <= s.start + s.len) return s.pos + (offset - s.start);
    }
    return -1;
  };

  return { text, posAt };
}

/**
 * Anchors each finding's quote to a document range. Duplicate quotes claim
 * successive occurrences; findings whose quote no longer exists are dropped.
 */
export function locateFindings(
  findings: LintFinding[],
  index: ReturnType<typeof buildTextIndex>,
): Located[] {
  const claimed = new Set<number>();
  const located: Located[] = [];

  findings.forEach((finding, i) => {
    let start = -1;
    for (
      let at = index.text.indexOf(finding.quote);
      at !== -1;
      at = index.text.indexOf(finding.quote, at + 1)
    ) {
      if (!claimed.has(at)) {
        start = at;
        break;
      }
    }
    if (start === -1) return;

    const from = index.posAt(start);
    const to = index.posAt(start + finding.quote.length);
    if (from === -1 || to === -1 || from >= to) return;

    claimed.add(start);
    const id = `lint-${i}-${start}`;
    located.push({
      finding: { ...finding, id },
      range: { id, from, to, severity: finding.severity },
    });
  });

  return located;
}
