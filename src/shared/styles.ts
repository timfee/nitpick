/**
 * Curated style packages from the Vale package library
 * (library.json in https://github.com/vale-cli/packages).
 *
 * Nitpicker doesn't run the Vale CLI; instead the selected packages steer
 * Gemini's lint pass. `label`/`summary` feed the settings UI, `prompt` is the
 * instruction folded into the system prompt server-side.
 */

export interface StylePackage {
  id: string;
  label: string;
  summary: string;
  prompt: string;
}

export const STYLE_PACKAGES: readonly StylePackage[] = [
  {
    id: 'proselint',
    label: 'proselint',
    summary: 'The world’s greatest writers and editors by your side.',
    prompt:
      'Apply proselint’s advice: clichés, redundancy, jargon, illogic, malapropisms, ' +
      'and misused terms.',
  },
  {
    id: 'google',
    label: 'Google',
    summary: 'The Google developer documentation style guide.',
    prompt:
      'Follow the Google developer documentation style guide: write in second person ' +
      'and present tense, use active voice, and keep headings sentence case. Cut ' +
      'marketing filler.',
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    summary: 'The Microsoft writing style guide.',
    prompt:
      'Follow the Microsoft writing style guide: warm, crisp, and bias-free, with ' +
      'contractions welcome and formality kept low.',
  },
  {
    id: 'redhat',
    label: 'Red Hat',
    summary: 'The Red Hat supplementary style guide for technical docs.',
    prompt:
      'Follow the Red Hat supplementary style guide for technical documentation: ' +
      'precise terminology and consistent product naming, without anthropomorphism.',
  },
  {
    id: 'write-good',
    label: 'write-good',
    summary: 'Naive linter for English prose.',
    prompt:
      'Apply write-good checks: passive voice and weasel words, wordy phrasing and ' +
      'unnecessary adverbs, repeated words, and clunky "there is/are" openers.',
  },
  {
    id: 'alex',
    label: 'alex',
    summary: 'Catch insensitive, inconsiderate writing.',
    prompt:
      'Flag insensitive or inconsiderate wording: gendered, ableist, condescending, ' +
      'or exclusionary language, with neutral alternatives.',
  },
  {
    id: 'joblint',
    label: 'Joblint',
    summary: 'Test tech job posts for sexism, culture fit, and recruiter fails.',
    prompt:
      'Treat the text as a tech job post and flag sexism, bro culture, unrealistic ' +
      'expectations, and recruiter clichés.',
  },
  {
    id: 'readability',
    label: 'Readability',
    summary: 'Popular readability metrics as lint checks.',
    prompt:
      'Flag passages that hurt readability: sentences over 25 words, dense paragraphs, ' +
      'nested clauses, and complex words where simple ones work.',
  },
  {
    id: 'ai-tells',
    label: 'AI tells',
    summary: 'Telltale patterns of AI-generated prose.',
    prompt:
      'Flag telltale patterns of AI-generated prose: numbered lead-ins, "not just X but Y" ' +
      'contrasts, announcement headings, overused AI vocabulary, em-dash overuse, and ' +
      'empty flourish.',
  },
  {
    id: 'openly',
    label: 'Openly',
    summary: 'Inclusive, open language checks.',
    prompt:
      'Flag non-inclusive language (ableism, ageism, gendered terms, violent metaphors, ' +
      'anthropomorphism) and suggest open, welcoming alternatives.',
  },
] as const;

export const STYLE_IDS = STYLE_PACKAGES.map((s) => s.id);

/** Styles applied when the user has never touched the settings screen. */
export const DEFAULT_STYLE_IDS = ['proselint'];
