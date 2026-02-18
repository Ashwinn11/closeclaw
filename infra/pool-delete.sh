#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Delete pool VMs
#
# Removes unclaimed VMs from GCP and Supabase.
#
# Usage:
#   ./infra/pool-delete.sh [vm-name]   — Delete specific VM
#   ./infra/pool-delete.sh --all       — Delete ALL unclaimed VMs
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

GCP_PROJECT="${GCP_PROJECT:-glowing-harmony-362803}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

TARGET="${1:?Usage: pool-delete.sh [vm-name|--all]}"

delete_vm() {
  local vm_name="$1"

  echo "  Deleting GCP VM: ${vm_name}"
  gcloud compute instances delete "$vm_name" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --quiet 2>/dev/null || echo "  ⚠ VM not found in GCP (may already be deleted)"

  echo "  Removing from Supabase..."
  curl -s \
    -X DELETE \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    "${SUPABASE_URL}/rest/v1/instances?gcp_instance_name=eq.${vm_name}" > /dev/null

  echo "  ✓ Deleted: ${vm_name}"
}

if [ "$TARGET" = "--all" ]; then
  echo "Fetching unclaimed instances..."

  vms=$(curl -s \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    "${SUPABASE_URL}/rest/v1/instances?select=gcp_instance_name&status=eq.available" \
    | python3 -c "
import sys, json
for inst in json.load(sys.stdin):
    print(inst['gcp_instance_name'])
")

  if [ -z "$vms" ]; then
    echo "No unclaimed VMs to delete."
    exit 0
  fi

  echo "Will delete:"
  echo "$vms" | sed 's/^/  - /'
  echo ""
  read -p "Confirm? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
  fi

  while IFS= read -r vm; do
    delete_vm "$vm"
  done <<< "$vms"
else
  delete_vm "$TARGET"
fi

echo "Done."
