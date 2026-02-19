#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Pool VM provisioner
#
# Creates GCP VMs from the openclaw-base-image machine image,
# registers them in the Supabase instances table, and sets up Tailscale.
#
# Usage:
#   ./infra/pool-create.sh [count]   — Create N new pool VMs (default: 1)
#
# Prerequisites:
#   - gcloud CLI authenticated with project glowing-harmony-362803
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in infra/.env
#   - GCP Secret Manager secrets set up (TAILSCALE_AUTHKEY, API keys)
#   - Machine image "openclaw-base-image" exists in the project
#   - Service account closeclaw-gateway-sa has secretmanager.secretAccessor role
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
MACHINE_IMAGE="${MACHINE_IMAGE:-openclaw-base-image}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-medium}"
VM_COUNT="${1:-1}"
SA_EMAIL="closeclaw-gateway-sa@${GCP_PROJECT}.iam.gserviceaccount.com"

# Supabase — needed locally to register the VM after creation.
# Tailscale authkey is fetched from Secret Manager on the VM at boot.
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
  # 1. Authenticates Tailscale (key from Secret Manager)
  # 2. Fetches all API keys from Secret Manager → writes to .env
  # 3. Sets unique gateway token
  # 4. Starts docker compose
  local startup_script='#!/bin/bash
set -e
log() { echo "[closeclaw-startup] $*" | sudo tee -a /var/log/closeclaw-startup.log; }
PROJECT=GCP_PROJECT_PLACEHOLDER

# ── Fetch secrets from Secret Manager ──
log "Fetching secrets from Secret Manager..."
TS_AUTHKEY=$(gcloud secrets versions access latest --secret=closeclaw-tailscale-authkey --project=$PROJECT 2>/dev/null)
GEMINI_KEY=$(gcloud secrets versions access latest --secret=closeclaw-gemini-api-key --project=$PROJECT 2>/dev/null || true)
OPENAI_KEY=$(gcloud secrets versions access latest --secret=closeclaw-openai-api-key --project=$PROJECT 2>/dev/null || true)
ANTHROPIC_KEY=$(gcloud secrets versions access latest --secret=closeclaw-anthropic-api-key --project=$PROJECT 2>/dev/null || true)

# ── Tailscale ──
log "Setting up Tailscale..."
sudo tailscale up --authkey="$TS_AUTHKEY" --hostname=VM_NAME_PLACEHOLDER
for i in {1..30}; do
  TS_IP=$(tailscale ip -4 2>/dev/null || true)
  [ -n "$TS_IP" ] && break
  sleep 2
done
log "Tailscale IP: ${TS_IP:-unknown}"

# ── Write .env with secrets + unique gateway token ──
USER_DIR="/home/$(ls /home/ | head -1)"
cd "$USER_DIR/openclaw"
cat > .env << EOF
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_TOKEN=GATEWAY_TOKEN_PLACEHOLDER
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_CONFIG_DIR=$USER_DIR/.openclaw
OPENCLAW_WORKSPACE_DIR=$USER_DIR/.openclaw/workspace
GEMINI_API_KEY=$GEMINI_KEY
OPENAI_API_KEY=$OPENAI_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
EOF
log ".env written with secrets."

# ── Start Gateway ──
log "Starting openclaw gateway..."
sudo docker compose up -d openclaw-gateway
log "VM VM_NAME_PLACEHOLDER bootstrapped. Tailscale IP: ${TS_IP:-unknown}"
'
  # Inject runtime values into startup script
  startup_script="${startup_script//GCP_PROJECT_PLACEHOLDER/${GCP_PROJECT}}"
  startup_script="${startup_script//VM_NAME_PLACEHOLDER/${vm_name}}"
  startup_script="${startup_script//GATEWAY_TOKEN_PLACEHOLDER/${gateway_token}}"

  gcloud compute instances create "$vm_name" \
    --project="$GCP_PROJECT" \
    --zone="$GCP_ZONE" \
    --source-machine-image="$MACHINE_IMAGE" \
    --machine-type="$MACHINE_TYPE" \
    --service-account="$SA_EMAIL" \
    --scopes="cloud-platform" \
    --tags="pool-available" \
    --labels="pool=available,instance-id=${instance_id}" \
    --metadata="startup-script=${startup_script}" \
    --no-address \
    --quiet

  echo "  ✓ VM created: ${vm_name}"
}

wait_for_tailscale_ip() {
  local vm_name="$1"
  local max_attempts=30

  echo "  Waiting for Tailscale IP on ${vm_name}..." >&2

  for i in $(seq 1 $max_attempts); do
    # Check Tailscale status for this hostname
    local ts_ip
    ts_ip=$(tailscale status --json 2>/dev/null | \
      python3 -c "
import sys, json
data = json.load(sys.stdin)
peers = data.get('Peer', {})
for key, peer in peers.items():
    if peer.get('HostName', '') == '${vm_name}':
        addrs = peer.get('TailscaleIPs', [])
        if addrs:
            print(addrs[0])
            break
" 2>/dev/null || true)

    if [ -n "$ts_ip" ]; then
      echo "  ✓ Tailscale IP: ${ts_ip}" >&2
      echo "$ts_ip"
      return 0
    fi

    sleep 5
  done

  echo "  ⚠ Timeout waiting for Tailscale IP. Register manually later." >&2
  echo ""
  return 1
}

register_in_supabase() {
  local instance_id="$1"
  local vm_name="$2"
  local gateway_token="$3"
  local tailscale_ip="${4:-}"

  echo "  Registering in Supabase: ${vm_name}"

  local payload
  payload=$(cat <<EOF
{
  "gcp_instance_name": "${vm_name}",
  "gcp_zone": "${GCP_ZONE}",
  "internal_ip": "${tailscale_ip}",
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

  # 2. Wait for Tailscale IP (best-effort)
  tailscale_ip=""
  if command -v tailscale &>/dev/null; then
    tailscale_ip=$(wait_for_tailscale_ip "$vm_name" 2>/dev/null) || true
  else
    echo "  ⚠ tailscale CLI not available locally. IP will need manual registration."
  fi

  # 3. Register in Supabase
  register_in_supabase "$instance_id" "$vm_name" "$gateway_token" "$tailscale_ip"

  echo ""
done

echo "═══════════════════════════════════════════════════════════"
echo " Done! ${VM_COUNT} VM(s) added to the pool."
echo ""
echo " If Tailscale IPs weren't resolved, run:"
echo "   ./infra/pool-update-ips.sh"
echo "═══════════════════════════════════════════════════════════"
