#!/usr/bin/env bash
set -euo pipefail

PROJECT="glowing-harmony-362803"
REGION="us-central1"
IMAGE="gcr.io/${PROJECT}/closeclaw-api"
SERVICE="closeclaw-api"

echo "Building and pushing image..."
gcloud builds submit . \
  --config=apps/api/cloudbuild-api.yaml \
  --project="$PROJECT"

echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --network default \
  --subnet default \
  --vpc-egress private-ranges-only \
  2>&1

echo "Done. Service URL:"
gcloud run services describe "$SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --format "value(status.url)"
