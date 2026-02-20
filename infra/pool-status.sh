#!/usr/bin/env bash
# ============================================================================
# CloseClaw — Pool status viewer
#
# Lists all instances in the pool with their current status.
#
# Usage:
#   ./infra/pool-status.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
fi

SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is required}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

echo "═══════════════════════════════════════════════════════════"
echo " CloseClaw Instance Pool Status"
echo "═══════════════════════════════════════════════════════════"
echo ""

curl -s \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  "${SUPABASE_URL}/rest/v1/instances?select=id,gcp_instance_name,gcp_zone,internal_ip,status,user_id,claimed_at,created_at&order=created_at.asc" \
  | python3 -c "
import sys, json
from datetime import datetime

instances = json.load(sys.stdin)

if not instances:
    print('  No instances in pool.')
    sys.exit(0)

# Status colors (ANSI)
colors = {
    'available': '\033[32m',  # green
    'claimed': '\033[33m',    # yellow
    'active': '\033[36m',     # cyan
    'error': '\033[31m',      # red
}
reset = '\033[0m'

counts = {}

print(f'  {'VM Name':<30} {'Status':<12} {'Internal IP':<18} {'User':<12} {'Zone'}')
print(f'  {'-'*30} {'-'*12} {'-'*18} {'-'*12} {'-'*15}')

for inst in instances:
    status = inst.get('status', '?')
    color = colors.get(status, '')
    vm = inst.get('gcp_instance_name', '?')
    ip = inst.get('internal_ip', '—') or '—'
    user = (inst.get('user_id', '') or '—')[:8]
    zone = inst.get('gcp_zone', '?')

    counts[status] = counts.get(status, 0) + 1
    print(f'  {vm:<30} {color}{status:<12}{reset} {ip:<18} {user:<12} {zone}')

print()
print('  Summary:')
for s, c in sorted(counts.items()):
    color = colors.get(s, '')
    print(f'    {color}{s}{reset}: {c}')
print(f'    total: {len(instances)}')
"

echo ""
