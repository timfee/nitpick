/**
 * The readability metrics from the Vale "Readability" style package
 * (errata-ai/Readability), computed locally so the status bar can show live
 * scores without a model call.
 */

/**
 * Acceptable-range grading shared by every metric. `limit` is the threshold
 * the upstream Vale "Readability" style package (errata-ai/Readability) warns
 * at — see each rule's `condition` in Readability/*.yml. For grade-level
 * metrics (lower is easier) the rule fires above the limit; for the inverted
 * Flesch reading ease (higher is easier) it fires below it.
 */
export interface ReadabilityThreshold {
  /** The Vale rule's threshold for this metric. */
  limit: number;
  /** Short human form for tooltips, e.g. "aim for 8 or less". */
  range: string;
  /** ok: within the Vale limit. high: up to 3x over. severe: beyond that. */
  status: 'ok' | 'high' | 'severe';
}

export interface ReadabilityGrade extends ReadabilityThreshold {
  id: string;
  label: string;
  /** Compact status-bar label, e.g. "FK". */
  short: string;
  value: number;
  /** One-line tooltip explaining what the number means. */
  hint: string;
}

export interface ReadabilityReport {
  words: number;
  sentences: number;
  /** Flesch reading ease, 0–100, higher is easier. */
  ease: ReadabilityThreshold & { value: number; verdict: string };
  /** Grade-level metrics, lower is easier. */
  grades: ReadabilityGrade[];
}

/** Below this the formulas are noise, so the UI shows a hint instead. */
const MIN_WORDS = 10;

export function analyzeReadability(text: string): ReadabilityReport | null {
  const words = text.split(/\s+/).flatMap((raw) => {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return word ? [word] : [];
  });
  if (words.length < MIN_WORDS) return null;

  const sentences = Math.max(1, (text.match(/[.!?]+(?=\s|$)/g) ?? []).length);
  const letters = words.reduce((n, w) => n + w.length, 0);
  const syllableCounts = words.map(syllables);
  const totalSyllables = syllableCounts.reduce((a, b) => a + b, 0);
  const polysyllables = syllableCounts.filter((n) => n >= 3).length;
  const longWords = words.filter((w) => w.length > 6).length;

  const wps = words.length / sentences;
  const spw = totalSyllables / words.length;

  const ease = clamp(206.835 - 1.015 * wps - 84.6 * spw, 0, 100);
  const grades: ReadabilityGrade[] = [
    {
      id: 'FleschKincaid',
      short: 'FK',
      label: 'Flesch-Kincaid',
      value: 0.39 * wps + 11.8 * spw - 15.59,
      hint: 'US school grade needed to follow the text',
      limit: 8,
      range: 'aim for 8 or less',
      status: 'ok',
    },
    {
      id: 'GunningFog',
      short: 'Fog',
      label: 'Gunning fog',
      value: 0.4 * (wps + 100 * (polysyllables / words.length)),
      hint: 'Years of schooling needed on a first read',
      limit: 10,
      range: 'aim for 10 or less',
      status: 'ok',
    },
    {
      id: 'SMOG',
      short: 'SMOG',
      label: 'SMOG',
      value: 1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291,
      hint: 'Grade estimate from long-word density',
      limit: 10,
      range: 'aim for 10 or less',
      status: 'ok',
    },
    {
      id: 'ColemanLiau',
      short: 'CL',
      label: 'Coleman-Liau',
      value: 5.88 * (letters / words.length) - 29.6 * (sentences / words.length) - 15.8,
      hint: 'Grade estimate from letters per word',
      limit: 9,
      range: 'aim for 9 or less',
      status: 'ok',
    },
    {
      id: 'AutomatedReadability',
      short: 'ARI',
      label: 'Automated readability',
      value: 4.71 * (letters / words.length) + 0.5 * wps - 21.43,
      hint: 'Grade estimate from characters and sentence length',
      limit: 8,
      range: 'aim for 8 or less',
      status: 'ok',
    },
    {
      id: 'LIX',
      short: 'LIX',
      label: 'LIX',
      value: wps + 100 * (longWords / words.length),
      hint: 'Long-word density; 40 and up reads as difficult',
      limit: 35,
      range: 'aim for 35 or less',
      status: 'ok',
    },
  ].map((g) => {
    const value = Math.max(0, round1(g.value));
    return { ...g, value, status: gradeStatus(value, g.limit) };
  });

  const easeLimit = 70;
  return {
    words: words.length,
    sentences,
    ease: {
      value: Math.round(ease),
      verdict: verdictFor(ease),
      limit: easeLimit,
      range: 'aim for 70 or more',
      status: easeStatus(ease, easeLimit),
    },
    grades,
  };
}

/** Grade-level metrics: lower is easier, so the Vale rule fires above `limit`. */
function gradeStatus(value: number, limit: number): ReadabilityThreshold['status'] {
  if (value <= limit) return 'ok';
  if (value <= 3 * limit) return 'high';
  return 'severe';
}

/** Flesch reading ease is inverted: higher is easier, so the rule fires below `limit`. */
function easeStatus(value: number, limit: number): ReadabilityThreshold['status'] {
  if (value >= limit) return 'ok';
  if (value >= limit / 3) return 'high';
  return 'severe';
}

function verdictFor(ease: number): string {
  if (ease >= 90) return 'Very easy to read';
  if (ease >= 80) return 'Easy to read';
  if (ease >= 70) return 'Fairly easy to read';
  if (ease >= 60) return 'Plain English';
  if (ease >= 50) return 'Fairly hard to read';
  if (ease >= 30) return 'Hard to read';
  return 'Very hard to read';
}

/** Vowel-group heuristic with silent-e handling; close enough for scoring. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g)?.length ?? 0;
  const silentE = /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) ? 1 : 0;
  return Math.max(1, groups - silentE);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
