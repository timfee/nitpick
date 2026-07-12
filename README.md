# Nitpicker

An editor that checks prose with Gemini, in the spirit of
[proselint](https://github.com/amperser/proselint). Write, run a check, and get
inline findings — redundancies, clichés, weasel words, grammar — each with a
one-click fix.

Angular 22 with SSR, Angular Material, and an
[ngx-tiptap](https://github.com/sibiraj-s/ngx-tiptap) editor. Zod defines the
lint contract once: it validates on the server and becomes Gemini's
structured-output schema. Gemini runs through `@google/genai` on Vertex AI with
Application Default Credentials, sign-in is Google Identity Services verified
server-side, and one Express process serves both the rendered app and the API.

## Setup

Resource sets live in `src/environments/` — prod and dev share a project but
use separate Cloud Run services.

```bash
scripts/init.sh              # one-time: create project, APIs, IAM, deploy prod
scripts/init.sh --env dev    # same, for the dev service
scripts/doctor.sh            # read-only verification of an existing setup
```

The one manual step is the OAuth web client ID (Google has no API for it);
init prints instructions. Add the service URL and `http://localhost:4200` as
authorized JavaScript origins, then put the ID in
`src/environments/environment*.ts`.

## Continuous deployment

Merges to `main` deploy to Cloud Run through `.github/workflows/deploy.yml`,
authenticating with Workload Identity Federation — keyless, no secrets in
GitHub. One-time setup, run with your own gcloud login:

```bash
scripts/setup-deploy.sh      # WIF pool + provider, deploy service account,
                             # GitHub repository variables (via gh if present)
```

The workflow carries the current identity as defaults; if the GCP side is
ever recreated, either update the defaults or set the
`GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_DEPLOY_SERVICE_ACCOUNT` repository
variables (they win over the defaults). Manual deploys keep working:
`scripts/init.sh` re-deploys from source.

## Configuration

Environment variables override the environment-file defaults.

| Variable               | Default            | Purpose                                              |
| ---------------------- | ------------------ | ---------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | from environment.ts | OAuth web client ID for Sign in with Google          |
| `GOOGLE_CLOUD_PROJECT` | from environment.ts | Project used for Vertex AI                           |
| `GEMINI_MODEL`         | `gemini-3-flash-preview` | Vertex AI model                                      |
| `VERTEX_LOCATION`      | `global`           | Vertex AI location                                   |
| `ALLOWED_DOMAIN`       | —                  | Restrict sign-in to one Workspace domain             |
| `NG_ALLOWED_HOSTS`     | —                  | Extra SSR hostnames beyond `*.run.app` and localhost |

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

`npm run lint:prose` runs [Vale](https://vale.sh) over the prose in this
repo: Markdown docs, code comments, and template microcopy — visible text
plus labels and tooltips, extracted with the Angular compiler so `@if`/`@for`
control flow doesn't confuse it.

The script self-heals: mechanical findings (Latin abbreviations, double
spacing, exclamation points, emojis, repeated words) are fixed in place and
re-linted until stable; anything needing judgment — spelling, marketing
filler, heading case — is reported for a human. Pass `--check` to report
without touching files. The house rules live in `.vale/styles/Nitpick/`;
project words go in `.vale/styles/config/vocabularies/Nitpick/accept.txt`.
