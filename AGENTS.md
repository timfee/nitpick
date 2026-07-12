# Agent conventions

- Skills live in `.agents/skills/`. Agent-specific directories such as `.claude/skills/`
  hold symlinks into it, never copies. `GEMINI.md` is a symlink to this file.
- Angular 22: standalone components, signals, zoneless. Services use `@Service()`,
  guards are functional, dependencies come from `inject()`.
- All styling goes through Angular Material's M3 system tokens (`--mat-sys-*`) and the
  `mat.theme` / `mat.theme-overrides` APIs. One global stylesheet (`src/styles.scss`).
  Non-trivial components use separate `.html`/`.scss` files next to the `.ts`; only
  trivial components keep inline templates/styles. No Tailwind.
- Typography is Google Sans Flex: weight 375 base, 450 for emphasis, 550 rarely.
  Sentence case everywhere — no all-caps text, no emojis, no marketing filler.
- The lint contract is the Zod schema in `src/shared/lint.ts`; the server validates with
  it, Gemini's structured output derives from it, the client imports only its types.
  Keep numeric length constraints out of the Gemini-facing schema (Vertex rejects them);
  enforce limits in code.
- `src/api/` is server-only code hosted by the SSR server. Auth is a Google ID token in
  a cookie, verified server-side. Gemini is called through `@google/genai` in Vertex
  mode with Application Default Credentials — no API keys, no key files, no secrets in
  the repo.
- Verify with `npm run lint` (typed eslint, zero findings), `npm run lint:prose`
  (Vale over docs, comments, and template microcopy — it self-heals mechanical
  findings in place; `--check` only reports), and `npm run build`.
  Google Cloud resources: `scripts/init.sh` creates, `scripts/doctor.sh` verifies.
- Commits carry no AI attribution, co-authorship, or tool mentions.
