#!/usr/bin/env bash
# ============================================================================
# CloseClaw — One-time Secret Manager setup
#
# Run this ONCE before creating the base machine image.
# Stores all API keys in GCP Secret Manager so VMs never have keys on disk.
#
# Usage:
#   ./infra/setup-secrets.sh
#
# Prerequisites:
#   - gcloud CLI authenticated as project owner
#   - infra/.env loaded (for key values)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

GCP_PROJECT="${GCP_PROJECT:-glowing-harmony-362803}"
SA_NAME="closeclaw-gateway-sa"
SA_EMAIL="${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com"

echo "═══════════════════════════════════════════════════════════"
echo " CloseClaw Secret Manager Setup"
echo " Project: ${GCP_PROJECT}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── Enable APIs ──────────────────────────────────────────────────────────────
echo "Enabling required APIs..."
gcloud services enable secretmanager.googleapis.com --project="$GCP_PROJECT" --quiet
echo "  ✓ Secret Manager API enabled"

# ── Create service account ────────────────────────────────────────────────────
echo ""
echo "Creating service account: ${SA_NAME}..."
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$GCP_PROJECT" &>/dev/null; then
  echo "  ✓ Service account already exists"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$GCP_PROJECT" \
    --display-name="CloseClaw Gateway VM Service Account" \
    --description="Used by pool VMs to access secrets and write logs" \
    --quiet
  echo "  ✓ Service account created"
fi

# Grant logging + monitoring so Docker logs still flow to Cloud Logging
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/logging.logWriter" \
  --condition=None --quiet > /dev/null
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/monitoring.metricWriter" \
  --condition=None --quiet > /dev/null
echo "  ✓ Logging + monitoring roles granted"

# ── Helper: create or update a secret ────────────────────────────────────────
upsert_secret() {
  local secret_id="$1"
  local value="$2"

  if gcloud secrets describe "$secret_id" --project="$GCP_PROJECT" &>/dev/null; then
    echo -n "$value" | gcloud secrets versions add "$secret_id" \
      --project="$GCP_PROJECT" --data-file=- --quiet
    echo "  ✓ Updated secret: ${secret_id}"
  else
    echo -n "$value" | gcloud secrets create "$secret_id" \
      --project="$GCP_PROJECT" \
      --replication-policy="automatic" \
      --data-file=- --quiet
    echo "  ✓ Created secret: ${secret_id}"
  fi

  # Grant service account access to this specific secret
  gcloud secrets add-iam-policy-binding "$secret_id" \
    --project="$GCP_PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet > /dev/null
}

# ── Store secrets ─────────────────────────────────────────────────────────────
echo ""
echo "Storing secrets..."

GEMINI_API_KEY="${GEMINI_API_KEY:?GEMINI_API_KEY is required in .env}"
OPENAI_API_KEY="${OPENAI_API_KEY:?OPENAI_API_KEY is required in .env}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required in .env}"
SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required in .env}"

upsert_secret "closeclaw-gemini-api-key"          "$GEMINI_API_KEY"
upsert_secret "closeclaw-openai-api-key"           "$OPENAI_API_KEY"
upsert_secret "closeclaw-supabase-url"             "$SUPABASE_URL"
upsert_secret "closeclaw-supabase-service-role-key" "$SUPABASE_SERVICE_ROLE_KEY"

if [ -n "$ANTHROPIC_API_KEY" ] && [ "$ANTHROPIC_API_KEY" != "YOUR_ANTHROPIC_API_KEY_HERE" ]; then
  upsert_secret "closeclaw-anthropic-api-key" "$ANTHROPIC_API_KEY"
else
  echo "  ⚠ Skipping ANTHROPIC_API_KEY (not set)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Done! Next steps:"
echo ""
echo " 1. Swap the base VM's service account to: ${SA_EMAIL}"
echo "    gcloud compute instances set-service-account openclaw-gateway \\"
echo "      --zone=us-central1-a \\"
echo "      --service-account=${SA_EMAIL} \\"
echo "      --scopes=cloud-platform"
echo ""
echo " 2. Restart the VM and verify keys load correctly:"
echo "    sudo docker exec openclaw-openclaw-gateway-1 printenv | grep API_KEY"
echo ""
echo " 3. Verify no keys on disk:"
echo "    cat ~/openclaw/.env  # should have no key values"
echo ""
echo " 4. Create the machine image from the VM."
echo "═══════════════════════════════════════════════════════════"
