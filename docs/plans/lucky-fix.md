# Plan: one-shot bulk auto-fix ("I'm feeling lucky")

A single button that auto-fixes every current lint finding: findings are batched
per paragraph, each batch goes to Gemini as one small structured-output call,
calls run through a bounded pool with graceful backoff, results apply as they
arrive, and one action undoes the whole run. Users can steer the model with
per-document free-text instructions, and every call carries an AI-generated
document summary + key terms so fixes stay contextually consistent.

This plan is the synthesis of three research tracks: a codebase survey of the
existing fixer, an engineering brief on batched structured-output patterns for
`@google/genai`, and a heuristic (Nielsen-style) UX evaluation. It is written
to be divided among independent implementers; each work package below has an
explicit contract and acceptance criteria.

---

## What already exists (build on it, don't parallel it)

- `buildFixGroups(state, findings)` (`src/app/features/editor/blocks.ts`)
  already buckets live findings by enclosing paragraph — this **is** the
  "batch each line with failures" unit. Reuse it unchanged.
- `FixDialog` (`src/app/features/editor/fix-dialog.ts`) already composes
  rules-only fixes locally via `replacementPlan()` (right-to-left splice of
  `finding.suggestion` over each finding's live range) and calls `/api/fix`
  for groups needing the model. `EditorPage.openFixDialog()` already tracks an
  `undoSteps` counter and offers a snackbar Undo. Lucky mode is this pipeline
  made unattended and parallel.
- Findings carry **no positions** — only a verbatim `quote`. Live positions are
  recovered via `lintRangeById()` (`lint-highlight.ts`), which remaps
  decorations through every transaction. Any apply logic must resolve
  positions through that, never from stale offsets.
- `src/shared/lint.ts` is the single source of truth for the lint contract:
  zod schemas double as Gemini `responseJsonSchema` (via
  `toResponseJsonSchema()` in `src/api/genai.ts`) and as server-side
  validators. New request/response types go there. **Keep numeric length
  constraints out of Gemini-facing schemas** (Vertex rejects them); enforce
  limits in code.
- Server: Express router in `src/api/router.ts`, Google ID-token auth +
  in-memory per-user rate limit in `src/api/auth.ts`, Vertex-AI-only client in
  `src/api/genai.ts`. No retry/backoff exists anywhere today.
- No test infrastructure exists; verification is `npm run lint` (zero
  findings) + `npm run build`. AGENTS.md: no AI attribution in commits.

## Key design decisions (settled — do not re-litigate in implementation)

1. **Batch unit = paragraph group** (`FixGroup`), not literal text line.
   Paragraphs are the natural prose unit and the grouping code exists.
2. **Model returns per-finding replacements, not a full rewritten paragraph.**
   Unattended application needs validation granularity: each edit is checked
   (`findingIndex` in range, not duplicated, quote still present verbatim) and
   bad edits are skipped individually instead of discarding the batch. The
   existing `/api/fix` full-rewrite stays as-is for the review-dialog flow.
3. **Skip the model entirely for groups where every finding already has a
   non-empty `suggestion`** — apply locally with `replacementPlan()`. Only
   groups with at least one suggestion-less finding cost an API call.
4. **Pool lives server-side** (new `/api/lucky-fix` endpoint): concurrency
   3–4, retry only 429/503/network with server-provided `RetryInfo.retryDelay`
   when present, else exponential backoff + jitter, per-item retry cap 3.
   Non-retryable finish reasons (`SAFETY`, `RECITATION`, `MAX_TOKENS`) are
   classified as per-group skips, never retried. Partial failure is a normal
   result shape: `{ fixed: [...], skipped: [{groupIndex, reason}] }`.
5. **Editor freezes to read-only during the run** (`editor.setEditable(false)`
   in a `try/finally`). This removes the whole stale-position class of bugs
   and makes the counted undo safe (no interleaved manual edits). Keep
   `lintRangeById` re-anchoring as defense in depth.
6. **Undo = counted-undo, one explicit action.** ProseMirror history cannot
   retroactively group transactions that landed seconds apart, so each applied
   group is its own transaction and a persistent banner action replays
   `editor.commands.undo()` × N. Matches the existing fix-dialog convention.
7. **Doc summary + key terms**: one Gemini call at run start with a tiny
   schema `{ summary, keyTerms[] }`, cached server-side by content hash
   (in-memory LRU, short TTL). Budget: summary ≤ ~500 chars, ≤ 20 key terms —
   it is duplicated into every per-group request, so keep it small.
8. **Local instructions**: free-text, per-document-ish (client-side
   `localStorage`, same pattern as `StyleSettings`), max ~1000 chars, injected
   verbatim into the system instruction of both the summary call and every
   per-group call.
9. **Naming (UX review, severity: critical)**: the button face reads
   **"Fix all (N)"** in the findings-panel header; "I'm feeling lucky" is
   acceptable only as tooltip flavor. A jokey label miscalibrates trust for a
   bulk AI edit of the user's prose. No confirm dialog — the click is the
   confirmation, softened by instant, obvious reversibility.

## Shared contract (implement first, verbatim, in `src/shared/lint.ts`)

```ts
// Per-group fix request/response for the unattended bulk-fix flow.
// NOTE: no min/max constraints in Gemini-facing schemas (Vertex rejects
// them) — enforce limits in code, as with the existing schemas.

export const LuckyFixGroupSchema = z.object({
  paragraph: z.string(),          // current text of the paragraph
  before: z.string(),             // preceding paragraph(s), '' at doc start
  after: z.string(),              // following paragraph(s), '' at doc end
  findings: z.array(LintFindingSchema),
});

export const LuckyFixRequestSchema = z.object({
  groups: z.array(LuckyFixGroupSchema),   // code-enforced: 1..25 groups
  text: z.string(),                       // full doc text, for summary cache
  instructions: z.string(),               // user steering text, '' if none
  styles: z.array(StyleSelectionSchema).optional(),
});

// Gemini-facing response schema for ONE group:
export const LuckyFixEditsSchema = z.object({
  edits: z.array(z.object({
    findingIndex: z.number(),     // index into the group's findings[]
    replacement: z.string(),      // drop-in text replacing that finding's quote
  })),
});

// Endpoint response:
export const LuckyFixResponseSchema = z.object({
  results: z.array(z.object({
    groupIndex: z.number(),
    edits: z.array(z.object({ findingIndex: z.number(), replacement: z.string() })),
    skippedReason: z.string(),    // '' when fixed; 'rate-limited' | 'safety' |
  })),                            // 'invalid-output' | 'error' when skipped
  summary: z.string(),            // the doc summary used (for debuggability)
});
```

Server-side validation per group, before returning an edit: `findingIndex` in
range and unique; `findings[i].quote` still present verbatim in `paragraph`
(mirrors the `text.includes(quote)` guard in `lint.ts`); drop individual bad
edits, mark the group `invalid-output` only if **all** edits are bad.

---

## Work packages

### WP1 — Server: `/api/lucky-fix` (no client dependencies)

Files: `src/shared/lint.ts` (add contract above), new `src/api/lucky-fix.ts`,
`src/api/router.ts` (register route, same middleware chain as `/api/fix`).

1. Summary step: content-hash (`node:crypto` sha256) of `text` → in-memory
   `Map` LRU (~50 entries, ~10 min TTL). Miss → one `generateContent` call,
   schema `{ summary: string, keyTerms: array of string }`, temperature low.
   On summary failure, proceed with `summary: ''` — never fail the run for it.
2. Pool: dependency-free lane pool (concurrency 4) over `groups`. Retry
   classification: 429/503/network transient → backoff (prefer parsed
   `RetryInfo.retryDelay` from `error.details`, else `min(1000·2^attempt,
   15s)` + 30% jitter), cap 3 attempts; check
   `response.candidates?.[0]?.finishReason` and treat `SAFETY`/`RECITATION`/
   `MAX_TOKENS` as non-retryable skips.
3. Per-group prompt: system instruction = copy-editor persona (crib from
   `fix.ts`) + style instructions (reuse `styleInstructions()` pattern) +
   user `instructions` + "change ONLY the quoted spans; return one edit per
   finding index; preserve author voice; use doc summary/key terms for
   consistency". Contents = JSON of `{ summary, keyTerms, before, paragraph,
   after, issues: [{index, severity, rule, quote, message, suggestion}] }`.
4. Validate output with `LuckyFixEditsSchema.parse` + the per-edit checks
   above. Return the full `LuckyFixResponseSchema` shape; HTTP 200 even with
   skips — partial failure is data, not an error.

Acceptance: `npm run lint` + `npm run build` clean; manual curl of the
endpoint with a 2-group payload returns validated edits; a forced 429 (mock)
retries with delay; a group whose quote is absent comes back `invalid-output`.

### WP2 — Client run orchestration (depends only on the contract, mockable)

Files: `src/app/core/lint-api.ts` (add `luckyFix()`), `src/app/features/editor/editor-page.ts`.

1. New `lucky()` on `EditorPage`: guard re-entry (signal `luckyRunning`);
   `buildFixGroups()`; partition into local groups (all findings have
   `suggestion`) vs model groups; snapshot each group's paragraph text +
   neighbor paragraphs via `blockBounds`.
2. `editor.setEditable(false)` in `try/finally`; apply local groups
   immediately (reuse/extract `replacementPlan()` from `fix-dialog.ts` into a
   shared helper — it currently lives in the dialog); post model groups to
   `luckyFix()`; on response, for each fixed group resolve each finding's live
   range via `lintRangeById` and apply that group's edits right-to-left in one
   chained transaction; count `undoSteps` per applied transaction.
3. Remove resolved findings/ranges (`removeLintRange`, prune `findings`
   signal); leave skipped groups' findings untouched; set `stale` so the
   panel prompts a re-check; expose run state as signals for WP3:
   `luckyProgress { done, total }`, `luckyResult { fixedFindings,
   skippedGroups, undoSteps }`.
4. Undo action: replay `editor.commands.undo()` × `undoSteps`, restore
   findings as stale (simplest: set `stale` and clear the result banner).

Acceptance: lint+build clean; with the server stubbed, a 3-group run applies
2 fixed groups, leaves 1 skipped group's findings intact, one undo action
restores the exact prior text (verify by string equality of
`buildTextIndex(doc).text`), editor is editable again after both success and
thrown error.

### WP3 — UI: button, instructions popover, progress, post-run review

Files: `findings-panel.{ts,html}`, `editor-page.{ts,html}`, new small
`lucky-instructions` popover component (follow `lint-popover` conventions),
`src/app/core/style-settings.ts` or a sibling `LuckyInstructions` service
(localStorage, key `nitpicker.lucky.v1`), SCSS.

1. Findings-panel header: primary button **"Fix all (N)"** (tooltip:
   "I'm feeling lucky — fix every finding with AI"), hidden at zero findings,
   morphs into inline progress ("Fixing 3/9…") while running — the existing
   "Fix all with AI" (dialog wizard) button becomes the secondary "Review
   each…" action. No confirm dialog.
2. Adjacent pencil icon opens the instructions popover: one textarea,
   placeholder "e.g. keep British spellings; never touch quoted text",
   persisted to localStorage on close, visibly filled-state on the icon when
   non-empty.
3. During run: findings-panel items check off as their group resolves;
   changed spans get a ~2s highlight fade (decoration, reuse `LintHighlight`
   plugin patterns or a tiny sibling extension).
4. Completion banner (snackbar per app convention, ~15s duration):
   "Fixed 11 of 14 — Undo all" — skipped findings just remain in the panel,
   no red/error styling ("completion with caveats", not failure). If the run
   fixes nothing: "Couldn't fix anything this time — try Review each".
5. Edge states: button disabled while running (re-entry guard from WP2);
   offline/network error → re-enable editor, banner "Fix all failed — nothing
   was changed" when zero groups applied.

Acceptance: lint+build clean; keyboard/screen-reader reachable (button has
aria-label including the count; popover traps focus per Material conventions);
zero-findings state shows no button; double-click during a run is a no-op.

### WP3 addendum — design review outcomes (binding on WP3)

Rendered mockups of the four states live in `docs/plans/lucky-fix-mockups/`.
A design crit of those mockups produced these required changes:

1. **Unify the severity color taxonomy end to end.** Card left-borders and
   editor squiggles/highlights must use the same color per severity so a user
   can trace card → text without reading labels. (The tokens already exist:
   `.severity-*` classes in `styles.scss` drive both — verify no state in the
   new UI bypasses them.)
2. **"Editing is paused while fixes are applied" is a state banner, not a
   footnote.** Give it a tinted container row, not small gray caption text —
   it explains why the cursor stopped responding.
3. **Progress bar must be visually prominent** under the "Fixing x of y" pill,
   not just the count text — peripheral-vision feedback for a 10+ item run.
4. **Collapse resolved cards to a single line** (check + category + quote
   inline) once fixed; full-height resolved cards make the list grow at
   exactly the moment it should be shrinking.
5. **De-emphasize destructive/rare actions:** in the instructions popover,
   "Clear" must be visually lighter and spatially separated from "Done"; in
   the completion snackbar, "Review changes" is the primary action and
   "Undo all" drops to tertiary weight.
6. **The instructions pencil needs a tooltip and a persistent filled-state
   badge** (dot) whenever saved instructions exist — visible in the idle
   state, not only during a run.

### WP4 — Prompt quality + polish (after WP1–3 merge)

1. Tune the per-group system instruction against real docs: verify edits
   don't bleed outside quotes, key terms actually enforce consistency
   (e.g. consistent capitalization of a product name across paragraphs).
2. Verify backoff behavior under a real burst (temporarily lower the
   per-user rate limit in `auth.ts` to force 429s end-to-end).
3. Optional fast-follow (out of v1 scope, do not build now): "Review
   changes" jump-to-change navigation stepping through changed ranges;
   overlap-aware fallback to full-paragraph rewrite when two findings'
   quotes intersect.

## Suggested split across three implementers

- **Implementer A**: WP1 (server). Self-contained; the contract is fully
  specified above.
- **Implementer B**: WP2 (orchestration). Stub `LintApi.luckyFix()` against
  the contract until WP1 lands; the `replacementPlan()` extraction is the
  only edit that touches shared code — do it first and keep it mechanical.
- **Implementer C**: WP3 (UI). Binds only to WP2's signals; agree on the
  four signal names above and build against fakes.
- WP4 is a joint pass once the three land.

Merge order: contract commit (from A) → A/B/C in parallel → WP4.
