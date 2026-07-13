# Agent conventions

- Skills live in `.agents/skills/`. Agent-specific directories such as `.claude/skills/`
  hold symlinks into it, never copies. `GEMINI.md` is a symlink to this file.
- Angular 22: standalone components, signals, zoneless. Services use `@Service()`,
  guards are functional, dependencies come from `inject()`.
- All styling goes through Angular Material's M3 system tokens (`--mat-sys-*`) and the
  `mat.theme` / `mat.theme-overrides` APIs. One global stylesheet (`src/styles.scss`).
  Non-trivial components use separate `.html`/`.scss` files next to the `.ts`, and only
  trivial components keep inline templates and styles. Do not add Tailwind.
- Typography is Google Sans Flex. Weight 375 is the base, 450 marks emphasis, and 550
  appears only in rare moments of stress. Sentence case everywhere. Avoid all-caps
  text, emojis, and marketing filler.
- The lint contract is the Zod schema in `src/shared/lint.ts`. The server validates with
  it, Gemini's structured output derives from it, the client imports only its types.
  Keep numeric length constraints out of the Gemini-facing schema (Vertex rejects them)
  and enforce limits in code.
- `src/api/` is server-only code hosted by the SSR server. Auth is a Google ID token in
  a cookie, verified server-side. The server calls Gemini through `@google/genai` in
  Vertex mode with Application Default Credentials. Keep API keys, key files, and every
  other secret out of the repo.
- Verify with `npm run lint` (typed eslint, zero findings), `npm run lint:prose`
  (Vale over docs, comments, and microcopy, which fixes mechanical findings in place
  and only reports with `--check`), and `npm run build`.
  Google Cloud resources: `scripts/init.sh` creates, `scripts/doctor.sh` verifies.
- Never credit AI, co-authors, or tools in commits.
