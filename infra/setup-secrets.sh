#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Proxy-mode VM service-account setup
#
# Run this ONCE before creating the base machine image.
# In proxy-only architecture, VMs do not need provider API keys.
# This script now only ensures the VM service account exists with logging roles.
#
# Usage:
#   ./infra/setup-secrets.sh
#
# Prerequisites:
#   - gcloud CLI authenticated as project owner
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
echo " CloseClaw VM Service Account Setup (Proxy Mode)"
echo " Project: ${GCP_PROJECT}"
echo "═══════════════════════════════════════════════════════════"
echo ""

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
echo " 2. Ensure VM startup .env includes only proxy-mode vars (no provider API keys)."
echo ""
echo " 3. Create/update the machine image from the VM."
echo "═══════════════════════════════════════════════════════════"
