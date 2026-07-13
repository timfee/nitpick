# Nitpicker

An editor that checks prose with Gemini, in the spirit of
[proselint](https://github.com/amperser/proselint). Write, run a check, and get
inline findings (redundancies, clichés, weasel words, grammar), each with an
instant fix.

Angular 22 with SSR, Angular Material, and an
[ngx-tiptap](https://github.com/sibiraj-s/ngx-tiptap) editor. Zod defines the
lint contract once: it validates on the server and becomes Gemini's
structured-output schema. Gemini runs through `@google/genai` on Vertex AI
with Application Default Credentials. Google Identity Services handles
sign-in with server-side verification, and one Express process serves both
the rendered app and the API.

## Setup

Resource sets live in `src/environments/`. Prod and dev share a project but
use separate Cloud Run services.

```bash
scripts/init.sh              # one-time: create project, APIs, IAM, deploy prod
scripts/init.sh --env dev    # same, for the dev service
scripts/doctor.sh            # read-only verification of an existing setup
```

The one manual step is the OAuth web client ID (Google has no API for it).
Init prints instructions. Add the service URL and `http://localhost:4200` as
authorized JavaScript origins, then put the ID in
`src/environments/environment*.ts`.

## Continuous deployment

Merges to `main` deploy to Cloud Run through `.github/workflows/deploy.yml`,
authenticating with Workload Identity Federation, which keeps stored secrets
out of GitHub entirely. Run the one-time setup with your own gcloud login:

```bash
scripts/setup-deploy.sh      # WIF pool + provider, deploy service account,
                             # GitHub repository variables (via gh if present)
```

The workflow carries the current identity as defaults. If the GCP side is
ever recreated, either update the defaults or set the
`GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` repository
variables (they win over the defaults). Manual deploys keep working, since
`scripts/init.sh` re-deploys from source.

## Configuration

Environment variables override the environment-file defaults.

| Variable               | Default             | Purpose                                              |
| ---------------------- | ------------------- | ---------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | from environment.ts | OAuth web client ID for Sign in with Google          |
| `GOOGLE_CLOUD_PROJECT` | from environment.ts | Project used for Vertex AI                           |
| `GEMINI_MODEL`         | `gemini-3-flash-preview` | Vertex AI model                                 |
| `VERTEX_LOCATION`      | `global`            | Vertex AI location                                   |
| `ALLOWED_DOMAIN`       | (unset)             | Restrict sign-in to one Workspace domain             |
| `NG_ALLOWED_HOSTS`     | (unset)             | Extra SSR hostnames beyond `*.run.app` and localhost |

## Develop

```bash
npm ci
gcloud auth application-default login
npm start
```

`ng serve` runs the same Express server, so the API works in development
without a proxy. Verify changes with `npm run lint`, `npm run lint:prose`,
and `npm run build`.

## Prose linting

`npm run lint:prose` runs [Vale](https://vale.sh) over every place prose
lives in this repo. That covers the Markdown docs, code comments, template
microcopy, and user-facing strings in TypeScript code. The Angular compiler
extracts template text (visible copy plus labels and tooltips), so `@if` and
`@for` control flow never confuses the linter.

The script fixes mechanical findings in place and re-lints until stable.
Anything needing judgment, such as passive voice or weasel words, lands in
a report for a human. Pass `--check` to report without touching files.

Style packages come vendored in `.vale/styles` (proselint, write-good,
ai-tells, and Openly, pinned by `scripts/vendor-vale-styles.mjs`), joined by
the project's own Nitpick rules. Project words go in
`.vale/styles/config/vocabularies/Nitpick/accept.txt`.
