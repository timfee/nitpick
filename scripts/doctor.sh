#!/usr/bin/env bash
# Verifies the Google Cloud resources Nitpick needs are present and
# correctly configured. Read-only: creates nothing. When something is
# missing it advises running scripts/init.sh.
#
# Usage:
#   scripts/doctor.sh [--env dev|prod]
#
# Requires: gcloud (authenticated via `gcloud auth login`), node >= 24.

set -uo pipefail
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

PROBLEMS=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; PROBLEMS=$((PROBLEMS + 1)); }

SERVICE=$(read_env service)
PROJECT=$(read_env project)
REGION=$(read_env region)
CLIENT_ID=$(read_env googleClientId)
API_KEY=$(read_env googleApiKey)

echo "Resource set: $ENV_NAME (service=$SERVICE region=$REGION)"

echo "gcloud"
if ! command -v gcloud > /dev/null; then
  bad "gcloud is not installed — https://cloud.google.com/sdk/docs/install"
  exit 1
fi
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)
if [[ -n "$ACCOUNT" ]]; then ok "authenticated as $ACCOUNT"; else bad "not authenticated — run: gcloud auth login"; exit 1; fi

echo "Project"
if [[ -z "$PROJECT" ]]; then
  bad "no project in $ENV_FILE — run scripts/init.sh"
  exit 1
fi
if gcloud projects describe "$PROJECT" --format='value(projectId)' > /dev/null 2>&1; then
  ok "project $PROJECT"
else
  bad "project $PROJECT does not exist or is not accessible — run scripts/init.sh"
  exit 1
fi
if [[ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null)" == "True" ]]; then
  ok "billing enabled"
else
  bad "billing is not enabled — run scripts/init.sh"
fi

echo "APIs"
ENABLED=$(gcloud services list --enabled --project "$PROJECT" --format='value(config.name)' 2>/dev/null)
for api in aiplatform.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
  if grep -q "^${api}$" <<< "$ENABLED"; then ok "$api"; else bad "$api not enabled — run scripts/init.sh"; fi
done

echo "Google Drive"
if [[ -n "$API_KEY" ]]; then
  if grep -q "^drive.googleapis.com$" <<< "$ENABLED"; then
    ok "drive.googleapis.com enabled"
  else
    bad "googleApiKey is set but drive.googleapis.com is not enabled — run scripts/init.sh"
  fi
else
  ok "integration off (no googleApiKey) — init.sh prints the setup steps"
fi

echo "Cloud Run"
describe() {
  gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format="value($1)" 2>/dev/null
}
if [[ -n "$(describe metadata.name)" ]]; then
  ok "service $SERVICE exists in $REGION"

  SA=$(describe spec.template.spec.serviceAccountName)
  if gcloud projects get-iam-policy "$PROJECT" \
      --flatten='bindings[].members' \
      --filter="bindings.role:roles/aiplatform.user AND bindings.members:serviceAccount:$SA" \
      --format='value(bindings.role)' 2>/dev/null | grep -q .; then
    ok "$SA has roles/aiplatform.user"
  else
    bad "$SA is missing roles/aiplatform.user — run scripts/init.sh"
  fi

  if [[ -n "$CLIENT_ID" ]] || describe 'spec.template.spec.containers[0].env' | grep -q GOOGLE_CLIENT_ID; then
    ok "sign-in client ID configured"
  else
    bad "no OAuth client ID in $ENV_FILE or on the service — see the steps init.sh prints"
  fi

  ok "service URL: $(describe status.url)"
else
  bad "service $SERVICE not found in $REGION — run scripts/init.sh"
fi

echo
if [[ $PROBLEMS -eq 0 ]]; then
  echo "All checks passed."
else
  echo "$PROBLEMS problem(s) found."
  exit 1
fi
