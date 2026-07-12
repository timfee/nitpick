#!/usr/bin/env bash
# One-time setup for continuous deployment from GitHub Actions, keyless via
# Workload Identity Federation — no service-account keys are created and no
# credentials ever leave Google Cloud.
#
# Creates (idempotently):
#   - a workload identity pool + GitHub OIDC provider, locked to this repo
#   - a github-deploy service account with the roles a Cloud Run source
#     deploy needs
#   - the binding that lets workflow runs from this repo impersonate it
#
# Then sets the two GitHub repository variables the deploy workflow reads
# (via gh when available, otherwise it prints them to set by hand).
#
# Usage:
#   scripts/setup-deploy.sh [--env dev|prod] [--repo owner/name]
#
# Requires: gcloud (authenticated via `gcloud auth login`), node >= 24.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME=prod
REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  REPO=$(git remote get-url origin 2> /dev/null \
    | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
fi
[[ -n "$REPO" ]] || { echo "cannot infer repo — pass --repo owner/name" >&2; exit 2; }

ENV_FILE=src/environments/environment.ts
[[ "$ENV_NAME" == dev ]] && ENV_FILE=src/environments/environment.development.ts

read_env() {
  node --input-type=module -e "
    const { environment } = await import('./$ENV_FILE');
    console.log(environment['$1'] ?? '');
  "
}

step() { printf '\033[36m▸\033[0m %s\n' "$1"; }

PROJECT=$(read_env project)
[[ -n "$PROJECT" ]] || { echo "no project in $ENV_FILE — run scripts/init.sh first" >&2; exit 1; }
gcloud config set project "$PROJECT" -q
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

POOL=github
PROVIDER=github
SA_NAME=github-deploy
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

step "repo: $REPO · project: $PROJECT"

step "enabling APIs (iamcredentials, sts)"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT"

if ! gcloud iam workload-identity-pools describe "$POOL" --location global > /dev/null 2>&1; then
  step "creating workload identity pool $POOL"
  gcloud iam workload-identity-pools create "$POOL" \
    --location global --display-name "GitHub Actions"
else
  step "workload identity pool $POOL exists"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location global --workload-identity-pool "$POOL" > /dev/null 2>&1; then
  step "creating OIDC provider $PROVIDER (locked to $REPO)"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location global --workload-identity-pool "$POOL" \
    --display-name "GitHub" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '$REPO'"
else
  step "OIDC provider $PROVIDER exists"
fi

if ! gcloud iam service-accounts describe "$SA" > /dev/null 2>&1; then
  step "creating service account $SA_NAME"
  gcloud iam service-accounts create "$SA_NAME" --display-name "GitHub Actions deploy"
else
  step "service account $SA_NAME exists"
fi

step "granting deploy roles to $SA_NAME"
# What a `gcloud run deploy --source` needs: deploy the service, upload the
# source tarball, run the build, and act as the runtime service account.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/storage.admin \
  roles/artifactregistry.writer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$SA" --role "$role" --condition None > /dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_SA" \
  --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser > /dev/null

step "allowing $REPO workflow runs to impersonate $SA_NAME"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --role roles/iam.workloadIdentityUser > /dev/null

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

echo
if command -v gh > /dev/null && gh auth status > /dev/null 2>&1; then
  step "setting GitHub repository variables via gh"
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "$REPO" --body "$WIF_PROVIDER"
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "$REPO" --body "$SA"
  echo "done — pushes to main now deploy via .github/workflows/deploy.yml"
else
  echo "done — now set these repository variables (Settings → Secrets and"
  echo "variables → Actions → Variables) so the deploy workflow can run:"
  echo
  echo "  GCP_WORKLOAD_IDENTITY_PROVIDER = $WIF_PROVIDER"
  echo "  GCP_DEPLOY_SERVICE_ACCOUNT     = $SA"
fi
