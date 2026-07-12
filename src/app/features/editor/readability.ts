/**
 * The readability metrics from the Vale "Readability" style package
 * (errata-ai/Readability), computed locally so the settings screen can show
 * live scores without a model call.
 */

export interface ReadabilityGrade {
  id: string;
  label: string;
  value: number;
}

export interface ReadabilityReport {
  words: number;
  sentences: number;
  /** Flesch reading ease, 0–100, higher is easier. */
  ease: { value: number; verdict: string };
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
    { id: 'FleschKincaid', label: 'Flesch-Kincaid', value: 0.39 * wps + 11.8 * spw - 15.59 },
    {
      id: 'GunningFog',
      label: 'Gunning fog',
      value: 0.4 * (wps + 100 * (polysyllables / words.length)),
    },
    {
      id: 'SMOG',
      label: 'SMOG',
      value: 1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291,
    },
    {
      id: 'ColemanLiau',
      label: 'Coleman-Liau',
      value:
        5.88 * (letters / words.length) - 29.6 * (sentences / words.length) - 15.8,
    },
    {
      id: 'AutomatedReadability',
      label: 'Automated readability',
      value: 4.71 * (letters / words.length) + 0.5 * wps - 21.43,
    },
    { id: 'LIX', label: 'LIX', value: wps + 100 * (longWords / words.length) },
  ].map((g) => ({ ...g, value: Math.max(0, round1(g.value)) }));

  return {
    words: words.length,
    sentences,
    ease: { value: Math.round(ease), verdict: verdictFor(ease) },
    grades,
  };
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
