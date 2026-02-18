#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Update Tailscale IPs for pool VMs
#
# Scans Tailscale status and updates Supabase instances table with
# the correct internal IPs for all pool VMs.
#
# Usage:
#   ./infra/pool-update-ips.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

echo "Fetching pool instances from Supabase..."

# Get all instances that are missing IPs
instances=$(curl -s \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  "${SUPABASE_URL}/rest/v1/instances?select=id,gcp_instance_name,internal_ip&or=(internal_ip.is.null,internal_ip.eq.)")

echo "$instances" | python3 -c "
import sys, json, subprocess

instances = json.load(sys.stdin)
if not instances:
    print('All instances have IPs. Nothing to update.')
    sys.exit(0)

# Get Tailscale status
try:
    ts = json.loads(subprocess.check_output(['tailscale', 'status', '--json']).decode())
except Exception as e:
    print(f'Error getting Tailscale status: {e}')
    sys.exit(1)

peers = ts.get('Peer', {})
peer_map = {}
for key, peer in peers.items():
    hostname = peer.get('HostName', '')
    ips = peer.get('TailscaleIPs', [])
    if hostname and ips:
        peer_map[hostname] = ips[0]

updated = 0
for inst in instances:
    vm_name = inst.get('gcp_instance_name', '')
    inst_id = inst.get('id')
    current_ip = inst.get('internal_ip')

    if current_ip:
        continue

    ts_ip = peer_map.get(vm_name)
    if ts_ip:
        print(f'  {vm_name} → {ts_ip}')
        updated += 1
        # Print update command for shell to execute
        print(f'UPDATE:{inst_id}:{ts_ip}')
    else:
        print(f'  {vm_name} → not found in Tailscale mesh')

print(f'\n{updated} instance(s) to update.')
" 2>&1 | while IFS= read -r line; do
  if [[ "$line" == UPDATE:* ]]; then
    inst_id=$(echo "$line" | cut -d: -f2)
    ts_ip=$(echo "$line" | cut -d: -f3)

    curl -s \
      -X PATCH \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"internal_ip\": \"${ts_ip}\"}" \
      "${SUPABASE_URL}/rest/v1/instances?id=eq.${inst_id}" > /dev/null

    echo "  ✓ Updated ${inst_id} → ${ts_ip}"
  else
    echo "$line"
  fi
done

echo "Done."
