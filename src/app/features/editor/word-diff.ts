export interface DiffSegment {
  changed: boolean;
  text: string;
}

/**
 * Word-level LCS diff. Both sides share the `changed` flag: deletions on the
 * original, insertions on the suggestion. Falls back to unmarked text when
 * the inputs are too large for the quadratic table.
 */
export function diffWords(
  a: string,
  b: string,
): { original: DiffSegment[]; suggested: DiffSegment[] } {
  const aTokens = a.split(/(\s+)/).filter(Boolean);
  const bTokens = b.split(/(\s+)/).filter(Boolean);
  if (aTokens.length * bTokens.length > 500_000) {
    return { original: [{ changed: false, text: a }], suggested: [{ changed: false, text: b }] };
  }

  const rows = aTokens.length + 1;
  const cols = bTokens.length + 1;
  const lcs = new Uint32Array(rows * cols);
  for (let i = aTokens.length - 1; i >= 0; i--) {
    for (let j = bTokens.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        aTokens[i] === bTokens[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1]);
    }
  }

  const original: DiffSegment[] = [];
  const suggested: DiffSegment[] = [];
  const push = (list: DiffSegment[], changed: boolean, text: string) => {
    const last = list[list.length - 1];
    if (last?.changed === changed) last.text += text;
    else list.push({ changed, text });
  };

  let i = 0;
  let j = 0;
  while (i < aTokens.length && j < bTokens.length) {
    if (aTokens[i] === bTokens[j]) {
      push(original, false, aTokens[i]);
      push(suggested, false, bTokens[j]);
      i++;
      j++;
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      push(original, true, aTokens[i]);
      i++;
    } else {
      push(suggested, true, bTokens[j]);
      j++;
    }
  }
  while (i < aTokens.length) push(original, true, aTokens[i++]);
  while (j < bTokens.length) push(suggested, true, bTokens[j++]);

  return { original, suggested };
}
