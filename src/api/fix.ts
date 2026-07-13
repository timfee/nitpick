import { FixResponseSchema, MAX_FINDINGS, type FixRequest, type FixResponse } from '../shared/lint';
import { env } from './env';
import { GEMINI_TIMEOUT_MS, getGenAi, toResponseJsonSchema } from './genai';

const SYSTEM_INSTRUCTION = `You are Nitpicker, an expert copy editor.
The user sends a JSON object with a "passage" and the "issues" found in it,
and your job is rewriting the passage so no issue remains.

Rules:
- Fix every listed issue, changing nothing that the issues don't require.
- Preserve the author's meaning, structure, language, and dialect.
- Keep the passage as one block of plain text. Add headings, paragraph
  breaks, quotes, or commentary only when an issue explicitly asks for it.
- "rewrite" must be the complete passage, not a fragment or a diff.`;

const responseJsonSchema = toResponseJsonSchema(FixResponseSchema);

export async function fixText({ text, findings }: FixRequest): Promise<FixResponse> {
  const ai = await getGenAi();
  const issues = findings.slice(0, MAX_FINDINGS).map((f) => ({
    severity: f.severity,
    rule: f.rule || f.category,
    quote: f.quote,
    message: f.message,
    suggestion: f.suggestion || undefined,
  }));
  const response = await ai.models.generateContent({
    model: env.model,
    contents: JSON.stringify({ passage: text, issues }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.4,
      // Same guard as lint: a stalled Vertex call fails fast instead of
      // hanging the fix dialog's loading state.
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  });
  const { rewrite } = FixResponseSchema.parse(JSON.parse(response.text ?? '{}'));
  if (!rewrite.trim()) throw new Error('Model returned an empty rewrite');
  return { rewrite: rewrite.trim() };
}
