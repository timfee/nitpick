#!/usr/bin/env bash
# Verifies the Google Cloud resources Nitpick needs and creates what's missing.
# Everything is idempotent; run it as often as you like.
#
# Usage:
#   scripts/doctor.sh [--project PROJECT_ID] [--region REGION] [--deploy]
#
#   --deploy   also build and deploy the Cloud Run service from source
#
# Requires: gcloud, authenticated (gcloud auth login).

set -euo pipefail

SERVICE="${SERVICE:-nitpick}"
REGION="${REGION:-us-central1}"
PROJECT="${GOOGLE_CLOUD_PROJECT:-}"
DEPLOY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --deploy) DEPLOY=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fix()  { printf '  \033[33m+\033[0m %s\n' "$1"; }
warn() { printf '  \033[31m!\033[0m %s\n' "$1"; }

echo "Checking gcloud"
command -v gcloud > /dev/null || { warn "gcloud is not installed — https://cloud.google.com/sdk/docs/install"; exit 1; }
ok "gcloud $(gcloud version --format='value(core)' 2>/dev/null)"

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)
[[ -n "$ACCOUNT" ]] || { warn "not authenticated — run: gcloud auth login"; exit 1; }
ok "authenticated as $ACCOUNT"

echo "Checking project"
if [[ -z "$PROJECT" ]]; then
  PROJECT=$(gcloud config get-value project 2>/dev/null)
fi
[[ -n "$PROJECT" && "$PROJECT" != "(unset)" ]] || {
  warn "no project — pass --project or run: gcloud config set project PROJECT_ID"
  exit 1
}
gcloud projects describe "$PROJECT" --format='value(projectId)' > /dev/null
ok "project $PROJECT"

echo "Checking APIs"
ENABLED=$(gcloud services list --enabled --project "$PROJECT" --format='value(config.name)')
for api in aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
  if grep -q "^${api}$" <<< "$ENABLED"; then
    ok "$api"
  else
    fix "enabling $api"
    gcloud services enable "$api" --project "$PROJECT"
  fi
done

echo "Checking Cloud Run service"
SA=""
if gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(metadata.name)' > /dev/null 2>&1; then
  ok "service $SERVICE exists in $REGION"
  SA=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --format='value(spec.template.spec.serviceAccountName)')
  CLIENT_ID=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --format='value(spec.template.spec.containers[0].env)' | tr ';' '\n' | grep -o "GOOGLE_CLIENT_ID.*" || true)
  if [[ -n "$CLIENT_ID" ]]; then
    ok "GOOGLE_CLIENT_ID is set"
  else
    warn "GOOGLE_CLIENT_ID is not set — create an OAuth web client (see README) then run:"
    warn "  gcloud run services update $SERVICE --region $REGION --set-env-vars GOOGLE_CLIENT_ID=..."
  fi
else
  if $DEPLOY; then
    fix "deploying $SERVICE from source (first build takes a few minutes)"
  else
    warn "service $SERVICE not deployed — re-run with --deploy, or:"
    warn "  gcloud run deploy $SERVICE --source . --region $REGION --allow-unauthenticated"
  fi
fi

if $DEPLOY; then
  gcloud run deploy "$SERVICE" \
    --source "$(dirname "$0")/.." \
    --project "$PROJECT" \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT"
  SA=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" \
    --format='value(spec.template.spec.serviceAccountName)')
fi

if [[ -n "$SA" ]]; then
  echo "Checking IAM"
  if gcloud projects get-iam-policy "$PROJECT" \
      --flatten='bindings[].members' \
      --filter="bindings.role:roles/aiplatform.user AND bindings.members:serviceAccount:$SA" \
      --format='value(bindings.role)' | grep -q .; then
    ok "$SA has roles/aiplatform.user"
  else
    fix "granting roles/aiplatform.user to $SA"
    gcloud projects add-iam-policy-binding "$PROJECT" \
      --member "serviceAccount:$SA" \
      --role roles/aiplatform.user \
      --condition None > /dev/null
  fi
fi

echo "Done"
if gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)' 2>/dev/null; then
  echo "Remember: the service URL must be an authorized JavaScript origin on the OAuth client."
fi
