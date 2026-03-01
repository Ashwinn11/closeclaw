#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Pool VM provisioner
#
# Creates GCP VMs from the openclaw-base-image-v4 machine image,
# registers them in the Supabase instances table.
#
# Usage:
#   ./infra/pool-create.sh [count]   — Create N new pool VMs (default: 1)
#
# Prerequisites:
#   - gcloud CLI authenticated with project glowing-harmony-362803
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in infra/.env
#   - Machine image "openclaw-base-image-v4" exists in the project
#   - Service account closeclaw-gateway-sa exists for VM identity/logging
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if present
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# ─── Config ──────────────────────────────────────────────────────────────────

GCP_PROJECT="${GCP_PROJECT:-glowing-harmony-362803}"
GCP_ZONE="${GCP_ZONE:-us-central1-a}"
MACHINE_IMAGE="${MACHINE_IMAGE:-openclaw-base-image-v4}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
VM_COUNT="${1:-1}"
SA_EMAIL="closeclaw-gateway-sa@${GCP_PROJECT}.iam.gserviceaccount.com"


SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

# ─── Functions ───────────────────────────────────────────────────────────────

generate_token() {
  openssl rand -hex 32
}

generate_instance_id() {
  # Short unique ID for VM naming
  openssl rand -hex 4
}

create_vm() {
  local instance_id="$1"
  local vm_name="openclaw-pool-${instance_id}"
  local gateway_token="$2"

  echo "  Creating VM: ${vm_name} (${MACHINE_TYPE}, ${GCP_ZONE})"

  # Startup script runs on first boot:
  # 1. Writes proxy-only .env with unique gateway token
  # 2. Starts docker compose
  local startup_script='#!/bin/bash
set -e
log() { echo "[closeclaw-startup] $*" | sudo tee -a /var/log/closeclaw-startup.log; }

# ── Write .env with unique gateway token ──
# API keys are NOT stored on the VM — all AI calls are proxied through
# the CloseClaw API (closeclaw.in/api/proxy/*) using the gateway token for auth.
USER_DIR="/home/$(ls /home/ | head -1)"
cd "$USER_DIR/openclaw"
cat > .env << EOF
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_TOKEN=GATEWAY_TOKEN_PLACEHOLDER
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_CONFIG_DIR=$USER_DIR/.openclaw
OPENCLAW_WORKSPACE_DIR=$USER_DIR/.openclaw/workspace
EOF
log ".env written with gateway token."

# ── Write Gateway config ──
# Required for token-only auth over LAN (no device keypair, no TLS).
# Without these flags, openclaw v2026.2.27+ will either refuse to start
# or reject proxy connections.
#
# browser.executablePath is resolved dynamically from the Playwright cache
# so it survives Playwright version bumps in the Docker image.
mkdir -p "$USER_DIR/.openclaw"

CHROME_BIN=$(sudo docker run --rm --entrypoint find \
  ${OPENCLAW_IMAGE:-openclaw:latest} \
  /home/node/.cache/ms-playwright -name chrome -path "*/chrome-linux64/*" -type f 2>/dev/null | head -1)
CHROME_BIN="${CHROME_BIN:-/home/node/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome}"
log "Resolved Chromium path: $CHROME_BIN"

cat > "$USER_DIR/.openclaw/openclaw.json" << CFGEOF
{
  "browser": {
    "enabled": true,
    "headless": true,
    "noSandbox": true,
    "executablePath": "$CHROME_BIN"
  },
  "gateway": {
    "mode": "local",
    "port": 18789,
    "auth": {
      "mode": "token"
    },
    "controlUi": {
      "allowInsecureAuth": true,
      "dangerouslyDisableDeviceAuth": true,
      "dangerouslyAllowHostHeaderOriginFallback": true
    }
  }
}
CFGEOF
log "openclaw.json written with controlUi + browser config."

# ── Start Gateway ──
log "Starting openclaw gateway..."
sudo docker compose up -d openclaw-gateway

log "VM VM_NAME_PLACEHOLDER bootstrapped."
'
  # Inject runtime values into startup script
  startup_script="${startup_script//GCP_PROJECT_PLACEHOLDER/${GCP_PROJECT}}"
  startup_script="${startup_script//VM_NAME_PLACEHOLDER/${vm_name}}"
  startup_script="${startup_script//GATEWAY_TOKEN_PLACEHOLDER/${gateway_token}}"

  # Write to a temp file — avoids gcloud mis-parsing JSON inside --metadata
  # Note: no suffix after the X's — macOS mktemp requires X's at the end
  local tmpfile
  tmpfile=$(mktemp "${TMPDIR:-/tmp}/closeclaw-startup-XXXXXX")
  printf '%s' "$startup_script" > "$tmpfile"

  gcloud compute instances create "$vm_name" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --source-machine-image="$MACHINE_IMAGE" \
    --machine-type="$MACHINE_TYPE" \
    --service-account="$SA_EMAIL" \
    --scopes="cloud-platform" \
    --tags="pool-available" \
    --labels="pool=available,instance-id=${instance_id}" \
    --metadata-from-file="startup-script=${tmpfile}" \
    --no-address \
    --quiet

  rm -f "$tmpfile"
  echo "  ✓ VM created: ${vm_name}"
}

get_gcp_internal_ip() {
  local vm_name="$1"
  local max_attempts=12  # 12 × 5 s = 60 s

  echo "  Getting GCP internal IP for ${vm_name}..." >&2

  for i in $(seq 1 $max_attempts); do
    local gcp_ip
    gcp_ip=$(gcloud compute instances describe "$vm_name" \
      --zone="$GCP_ZONE" \
      --project="$GCP_PROJECT" \
      --format='value(networkInterfaces[0].networkIP)' 2>/dev/null || true)

    if [ -n "$gcp_ip" ]; then
      echo "  ✓ GCP internal IP: ${gcp_ip}" >&2
      echo "$gcp_ip"
      return 0
    fi

    sleep 5
  done

  echo "  ⚠ Timeout getting GCP internal IP. Register manually later." >&2
  echo ""
  return 1
}

register_in_supabase() {
  local instance_id="$1"
  local vm_name="$2"
  local gateway_token="$3"
  local internal_ip="${4:-}"

  echo "  Registering in Supabase: ${vm_name}"

  local payload
  payload=$(cat <<EOF
{
  "gcp_instance_name": "${vm_name}",
  "gcp_zone": "${GCP_ZONE}",
  "internal_ip": "${internal_ip}",
  "gateway_port": 18789,
  "gateway_token": "${gateway_token}",
  "status": "available"
}
EOF
)

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "$payload" \
    "${SUPABASE_URL}/rest/v1/instances")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" =~ ^2 ]]; then
    echo "  ✓ Registered in Supabase (HTTP ${http_code})"
  else
    echo "  ✗ Failed to register (HTTP ${http_code}): ${body}"
    return 1
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════"
echo " CloseClaw Pool Provisioner"
echo " Creating ${VM_COUNT} VM(s) from ${MACHINE_IMAGE}"
echo " Project: ${GCP_PROJECT} | Zone: ${GCP_ZONE}"
echo "═══════════════════════════════════════════════════════════"
echo ""

for i in $(seq 1 "$VM_COUNT"); do
  instance_id=$(generate_instance_id)
  gateway_token=$(generate_token)
  vm_name="openclaw-pool-${instance_id}"

  echo "── VM ${i}/${VM_COUNT}: ${vm_name} ──"

  # 1. Create the VM
  create_vm "$instance_id" "$gateway_token"

  # 2. Get GCP internal IP (available immediately after VM creation)
  gcp_ip=$(get_gcp_internal_ip "$vm_name" 2>/dev/null) || true

  # 3. Register in Supabase
  register_in_supabase "$instance_id" "$vm_name" "$gateway_token" "$gcp_ip"

  echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo " Done! ${VM_COUNT} VM(s) added to the pool."
echo ""
echo " If internal IPs weren't resolved, run:"
echo "   ./infra/pool-update-ips.sh"
echo "═══════════════════════════════════════════════════════════"
