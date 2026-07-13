import { LintReportSchema, MAX_FINDINGS, type LintReport, type StyleSelection } from '../shared/lint';
import { STYLE_RULES } from '../shared/style-rules';
import { DEFAULT_STYLE_IDS, STYLE_PACKAGES } from '../shared/styles';
import { env } from './env';
import { GEMINI_TIMEOUT_MS, getGenAi, toResponseJsonSchema } from './genai';

const SYSTEM_INSTRUCTION = `You are Nitpicker, an expert copy editor.
Lint the user's prose against the style packages listed below and report concrete,
specific findings.

Rules:
- Apply only the checks listed below, where each check reads
  "package/RuleName: what it flags".
- "rule" names the check that fired, exactly as listed (use "" when none
  fits cleanly), and "quote" is the smallest problematic span, copied
  verbatim from the text.
- Never invent issues: a clean text gets an empty findings list, a reported
  span appears once, and a handful of high-value findings beats a pile of
  trivial ones.
- "suggestion" holds a drop-in replacement that preserves the surrounding
  grammar (use "" when no direct rewrite applies).
- Match the author's language and dialect.`;

const responseJsonSchema = toResponseJsonSchema(LintReportSchema);

/**
 * Expands the client's style selections into per-check prompt lines, dropping
 * unknown package/rule ids against the generated catalog. An absent list
 * falls back to the default packages; an explicitly empty list means the
 * user turned everything off and lints nothing.
 */
function styleInstructions(styles: StyleSelection[] | undefined): string {
  const wanted: StyleSelection[] = styles ?? DEFAULT_STYLE_IDS.map((id) => ({ id }));
  const sections: string[] = [];

  for (const selection of wanted) {
    const pkg = STYLE_PACKAGES.find((p) => p.id === selection.id);
    if (!pkg) continue;
    const catalog = STYLE_RULES[pkg.id] ?? [];
    const enabled = new Set(selection.rules ?? catalog.map((r) => r.id));
    const checks = catalog.filter((r) => enabled.has(r.id));
    if (!checks.length) continue;
    sections.push(
      `${pkg.label}: ${pkg.prompt}\n` +
        checks.map((r) => `- ${pkg.id}/${r.id}: ${r.hint || r.id}`).join('\n'),
    );
  }

  return sections.join('\n\n');
}

export async function lintText(text: string, styles?: StyleSelection[]): Promise<LintReport> {
  const instructions = styleInstructions(styles);
  if (!instructions) return { findings: [] };

  const ai = await getGenAi();
  const response = await ai.models.generateContent({
    model: env.model,
    contents: text,
    config: {
      systemInstruction: `${SYSTEM_INSTRUCTION}\n\nStyle packages to apply:\n\n${instructions}`,
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0.2,
      // A stalled Vertex call must fail the request, not hang it: the client
      // is awaiting this round trip behind a button spinner.
      abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    },
  });
  const { findings } = LintReportSchema.parse(JSON.parse(response.text ?? '{}'));
  // Drop hallucinated quotes the editor would never be able to highlight.
  return {
    findings: findings.filter((f) => f.quote && text.includes(f.quote)).slice(0, MAX_FINDINGS),
  };
}
