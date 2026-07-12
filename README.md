# Nitpick

An editor that checks prose with Gemini, in the spirit of [proselint](https://github.com/amperser/proselint).
Write in a rich-text editor, run a check, and get inline findings — redundancies, clichés,
weasel words, grammar — each with a one-click fix.

## Stack

- Angular 22 — standalone components, signals, zoneless change detection, SSR with hydration
- Angular Material for all UI
- [ngx-tiptap](https://github.com/sibiraj-s/ngx-tiptap) (Tiptap 3) for the editor, with a custom
  ProseMirror decoration extension for inline lint highlights
- Zod as the single source of truth for the lint contract: it validates requests and responses
  on the server, and `z.toJSONSchema()` becomes Gemini's structured-output schema
- `@google/genai` in Vertex AI mode — authenticates with Application Default Credentials, no API keys
- Sign in with Google (Google Identity Services); ID tokens are verified server-side with
  `google-auth-library`
- One process serves everything: the Express server from Angular SSR also hosts the JSON API

## Layout

```
src/
  app/
    core/        auth service, auth guard, API client
    features/
      signin/    sign-in page (prerendered)
      editor/    editor page, findings panel, lint-highlight extension, text index
  api/           server-only: Express router, ID-token auth, Gemini lint call
  shared/        Zod schemas shared by client (types) and server (validation)
  server.ts      Angular SSR server + API mount
```

## Setup

Resource sets live in `src/environments/` — `environment.ts` (prod) and
`environment.development.ts` (dev) share one project but use separate Cloud Run
services. Two scripts manage the Google Cloud side:

- `scripts/init.sh [--env dev|prod]` — one-time setup. Creates the project when the
  environment file has none (and writes the new ID back), links billing, enables APIs,
  grants the build service account role, deploys the service from source, and grants
  `roles/aiplatform.user`. Prints instructions for the one manual step: creating the
  OAuth web client ID (Google offers no API for that).
- `scripts/doctor.sh [--env dev|prod]` — read-only verification of everything above;
  points at init when something is missing.

## Configuration

Defaults come from the environment files; environment variables override them at runtime.

| Variable               | Required | Default            | Purpose                                                                                 |
| ---------------------- | -------- | ------------------ | --------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | yes      | —                  | OAuth web client ID for Sign in with Google                                             |
| `GOOGLE_CLOUD_PROJECT` | no       | resolved from ADC  | Project used for Vertex AI                                                              |
| `GEMINI_MODEL`         | no       | `gemini-2.5-flash` | Vertex AI model                                                                         |
| `VERTEX_LOCATION`      | no       | `global`           | Vertex AI location                                                                      |
| `ALLOWED_DOMAIN`       | no       | —                  | Restrict sign-in to one Workspace domain                                                |
| `NG_ALLOWED_HOSTS`     | no       | —                  | Extra hostnames for SSR (custom domains); `*.run.app` and localhost are already allowed |

## Develop

```bash
npm ci
gcloud auth application-default login   # ADC for Vertex AI
GOOGLE_CLIENT_ID=...apps.googleusercontent.com npm start
```

`ng serve` runs the same Express server, so the API works in development without a proxy.

## Deploy to Cloud Run

Everything runs on Application Default Credentials — no key files.

```bash
scripts/init.sh              # first time (creates everything, deploys prod)
scripts/init.sh --env dev    # same, for the dev service
scripts/doctor.sh            # verify an existing setup
```

After the first deploy, add the service URL to the OAuth client's authorized
JavaScript origins and put the client ID in `src/environments/environment*.ts`
(or set `GOOGLE_CLIENT_ID` on the service).
