#!/usr/bin/env bash
# One-time setup: creates and seeds the Google Cloud resources Nitpick
# needs. Assumes nothing exists yet — for verification of an existing
# setup, use scripts/doctor.sh instead.
#
# Usage:
#   scripts/init.sh [--env dev|prod]
#
# Creates (as applicable):
#   - a project (when the environment file has none), linked to your first
#     open billing account, with the ID written back into both environment
#     files
#   - the required API enablements
#   - the Cloud Run service for the chosen resource set, deployed from source
#   - the roles/aiplatform.user grant for the service account
#
# The one thing it cannot create is the OAuth web client (Google offers no
# API for that) — it prints exact instructions at the end.
#
# Requires: gcloud (authenticated via `gcloud auth login`), node >= 24.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME=prod
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENV_NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

ENV_FILE=src/environments/environment.ts
[[ "$ENV_NAME" == dev ]] && ENV_FILE=src/environments/environment.development.ts

read_env() {
  node --input-type=module -e "
    const { environment } = await import('./$ENV_FILE');
    console.log(environment['$1'] ?? '');
  "
}

step() { printf '\033[36m▸\033[0m %s\n' "$1"; }

SERVICE=$(read_env service)
PROJECT=$(read_env project)
REGION=$(read_env region)
CLIENT_ID=$(read_env googleClientId)

step "resource set: $ENV_NAME (service=$SERVICE region=$REGION)"

if [[ -z "$PROJECT" ]]; then
  PROJECT="nitpick-$(tr -dc a-z0-9 < /dev/urandom | head -c6)"
  step "creating project $PROJECT"
  gcloud projects create "$PROJECT" --name="Nitpick"
  BILLING=$(gcloud billing accounts list --filter=open=true --format='value(name)' --limit=1)
  [[ -n "$BILLING" ]] || { echo "no open billing account — link one and re-run" >&2; exit 1; }
  step "linking billing account $BILLING"
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING" > /dev/null
  step "writing project ID into src/environments/"
  sed -i.bak "s/project: '[^']*'/project: '$PROJECT'/" \
    src/environments/environment.ts src/environments/environment.development.ts
  rm -f src/environments/*.bak
else
  step "using project $PROJECT from $ENV_FILE"
fi
gcloud config set project "$PROJECT" -q

step "enabling APIs (aiplatform, run, cloudbuild, artifactregistry)"
gcloud services enable \
  aiplatform.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT"

# Source deploys build with the compute default service account, which has
# no permissions on a fresh project.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
step "granting cloudbuild.builds.builder to the compute default service account"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role roles/cloudbuild.builds.builder \
  --condition None > /dev/null

step "deploying $SERVICE to Cloud Run from source (first build takes a few minutes)"
ENV_VARS="GOOGLE_CLOUD_PROJECT=$PROJECT"
[[ -n "$CLIENT_ID" ]] && ENV_VARS+=",GOOGLE_CLIENT_ID=$CLIENT_ID"
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "$ENV_VARS" \
  --quiet

SA=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')
step "granting roles/aiplatform.user to $SA"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" \
  --role roles/aiplatform.user \
  --condition None > /dev/null

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
  --format='value(status.url)')

echo
echo "done — service running at $URL"
if [[ -z "$CLIENT_ID" ]]; then
  echo
  echo "one manual step remains (Google offers no API for this):"
  echo "  1. https://console.cloud.google.com/apis/credentials?project=$PROJECT"
  echo "  2. Create credentials → OAuth client ID → Web application"
  echo "  3. Authorized JavaScript origins: $URL and http://localhost:4200"
  echo "  4. Paste the client ID into googleClientId in src/environments/environment*.ts"
  echo "  5. Re-deploy: scripts/init.sh --env $ENV_NAME (or scripts/doctor.sh to verify first)"
fi
