import { LintReportSchema, MAX_FINDINGS, type LintReport, type StyleSelection } from '../shared/lint';
import { STYLE_RULES } from '../shared/style-rules';
import { DEFAULT_STYLE_IDS, STYLE_PACKAGES } from '../shared/styles';
import { env } from './env';
import { getGenAi, toResponseJsonSchema } from './genai';

const SYSTEM_INSTRUCTION = `You are Nitpicker, an expert copy editor.
Lint the user's prose against the style packages listed below and report concrete,
actionable findings.

Rules:
- Apply only the checks listed below; each check is "package/RuleName: what it flags".
- "rule" must name the check that fired, exactly as listed, or "" if none fits cleanly.
- "quote" must be the smallest problematic span, copied character-for-character from the text.
- Never invent issues; when the text is clean, return an empty findings list.
- Prefer few high-value findings over many trivial ones; never report the same span twice.
- "suggestion" must be a drop-in replacement preserving the surrounding grammar, or "" if none.
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
    },
  });
  const { findings } = LintReportSchema.parse(JSON.parse(response.text ?? '{}'));
  // Drop hallucinated quotes the editor would never be able to highlight.
  return {
    findings: findings.filter((f) => f.quote && text.includes(f.quote)).slice(0, MAX_FINDINGS),
  };
}
