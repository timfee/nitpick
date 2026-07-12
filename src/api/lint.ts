import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

import { LintReportSchema, type LintReport } from '../shared/lint';
import { env } from './env';

const SYSTEM_INSTRUCTION = `You are Nitpick, an expert copy editor in the spirit of proselint.
Lint the user's prose and report concrete, actionable findings: redundancies, clichés,
weasel words, jargon, needless passive voice, wordiness, spelling, grammar, punctuation,
inconsistencies, and unclear phrasing.

Rules:
- "quote" must be the smallest problematic span, copied character-for-character from the text.
- Never invent issues; when the text is clean, return an empty findings list.
- Prefer few high-value findings over many trivial ones; never report the same span twice.
- "suggestion" must be a drop-in replacement preserving the surrounding grammar, or "" if none.
- Match the author's language and dialect.`;

// Gemini accepts standard JSON Schema, so the Zod contract doubles as the
// structured-output schema. `$schema` is stripped since Gemini rejects it.
const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(LintReportSchema);
delete responseJsonSchema['$schema'];

/**
 * Client is created lazily so credentials/project resolve via ADC at first
 * request: the metadata server on Cloud Run, `gcloud auth application-default
 * login` locally. No API keys anywhere.
 */
let client: Promise<GoogleGenAI> | undefined;
const getClient = () =>
  (client ??= (async () => {
    const project = env.project ?? (await new GoogleAuth().getProjectId());
    return new GoogleGenAI({ vertexai: true, project, location: env.location });
  })());

export async function lintText(text: string): Promise<LintReport> {
  const ai = await getClient();
  const response = await ai.models.generateContent({
    model: env.model,
    contents: text,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.2,
    },
  });
  const { findings } = LintReportSchema.parse(JSON.parse(response.text ?? '{}'));
  // Drop hallucinated quotes the editor would never be able to highlight.
  return { findings: findings.filter((f) => text.includes(f.quote)) };
}
