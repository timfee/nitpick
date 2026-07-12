import { z } from 'zod';

/**
 * Single source of truth for the lint API contract.
 *
 * - The server validates requests and Gemini's output against these schemas.
 * - `z.toJSONSchema(LintReportSchema)` becomes Gemini's structured-output schema.
 * - The client consumes the inferred types (type-only import, so Zod stays
 *   out of the browser bundle).
 */

export const CATEGORIES = [
  'clarity',
  'conciseness',
  'redundancy',
  'cliche',
  'jargon',
  'weasel-words',
  'passive-voice',
  'grammar',
  'spelling',
  'punctuation',
  'tone',
  'consistency',
] as const;

export const SEVERITIES = ['suggestion', 'warning', 'error'] as const;

export const LintRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
});

// No minLength/maxLength/maxItems here: Vertex AI rejects schemas whose
// length constraints produce too many decoding states. Limits are stated in
// the descriptions for the model and enforced in code on the way out.
export const LintFindingSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES),
  quote: z
    .string()
    .describe(
      'The smallest problematic span, copied verbatim from the text — every character, ' +
        'space and punctuation mark must match the source exactly. At most a sentence.',
    ),
  message: z
    .string()
    .describe('One or two plain sentences explaining the problem and how to fix it.'),
  suggestion: z
    .string()
    .describe('Drop-in replacement for the quote. Empty string when no direct rewrite applies.'),
});

export const LintReportSchema = z.object({
  findings: z
    .array(LintFindingSchema)
    .describe('All prose issues found, in document order. Empty when the text is clean.'),
});

/** Server-side cap on findings returned to the client. */
export const MAX_FINDINGS = 50;

export type LintCategory = (typeof CATEGORIES)[number];
export type LintSeverity = (typeof SEVERITIES)[number];
export type LintFinding = z.infer<typeof LintFindingSchema>;
export type LintReport = z.infer<typeof LintReportSchema>;
