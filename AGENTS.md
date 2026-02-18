# AGENTS.md

## Project overview

CloseClaw is a Vite + React web application with a Hono (Node.js) backend that provides users with their own isolated OpenClaw agent, running in a dedicated GCP Compute Engine VM in under 60 seconds.

Reference openclaw.ai for the full feature set. Official repo is in local directory under `openclaw/`.

Reference sites: simpleclaw.com and ampere.sh (pioneers of OpenClaw wrappers — use for design and UX inspiration only).

**Domain**: closeclaw.in (local dev for now)
**GCP project**: `glowing-harmony-362803`
**Networking**: Tailscale mesh — backend connects to Gateway VMs via Tailscale internal IPs (no public IP exposure, no SSH tunnels in production)

The application:

- Wraps OpenClaw
- Abstracts all infrastructure and API keys from users (operator provides all model keys)
- Uses WebSocket RPC for all agent interaction (single WS connection per user to their Gateway)
- Supports Telegram, Discord, and Slack (other channels shown as "upcoming" in dashboard)
- Uses Supabase Google OAuth only
- Uses Supabase Postgres for all data (users, instances, billing)
- Assigns users a GCP VM from a pool (tagged as claimed/unclaimed)
- Mock billing modal with tiers: $50, $75, $100 (partial credits: infra + API credits)

### Supported models

| Provider | Model ID | Alias | Role |
|----------|----------|-------|------|
| Google | `google/gemini-3-flash-preview` | Gemini | **Primary (default)** |
| Anthropic | `anthropic/claude-4.6-sonnet` | Sonnet | Fallback 1 |
| OpenAI | `openai/gpt-5.2-codex` | Codex | Fallback 2 |

All three models are operator-provided via API keys in `.env`. Users do not choose or provide models.

## Setup commands

### Local development

```bash
npm install
npm run dev        # frontend (Vite)
npm run dev:api    # backend (Hono)
npm test
```

### Prerequisites

- Node.js 20+
- npm
- Supabase project with Google OAuth enabled
- GCP project with Compute Engine API enabled
- No local Docker required — instances run on GCP VMs with pre-built machine images

Local development must run frontend and backend together. OpenClaw instances are remote GCP VMs.

## Repository structure

```
/
├─ apps/
│  ├─ web/        # Vite + React frontend
│  └─ api/        # Hono backend (Node.js)
├─ docker/
│  └─ openclaw/   # OpenClaw Docker image and pool config
├─ packages/
│  └─ shared/     # Shared types and RPC schemas
├─ infra/         # GCP machine image scripts, instance pool management
└─ AGENTS.md
```

Frontend and backend must remain strictly separated.

## GCP infrastructure model

### Goal

Run a persistent OpenClaw Gateway on a GCP Compute Engine VM using Docker, with durable state, baked-in binaries, and safe restart behavior. Target ~$5-12/mo per instance.

GCP project: `glowing-harmony-362803`. All VMs join the Tailscale mesh via `TAILSCALE_AUTHKEY` so the CloseClaw backend can reach them by Tailscale hostname/IP without public IP exposure.

### No local Docker

CloseClaw does not use Docker locally. Instead:

1. Create a GCP project and enable billing + Compute Engine API
2. Create a Compute Engine VM (e2-small, Debian 12, 20GB)
3. SSH into the VM, install Docker
4. Clone OpenClaw repo, build the Docker image with all required binaries baked in
5. Configure `.env` and `docker-compose.yml` with operator API keys
6. Build, launch, and verify the Gateway
7. Create a GCP machine image from this configured VM
8. Use the machine image to spin up new instances for users

### Prerequisites

- GCP account (free tier eligible for e2-micro)
- `gcloud` CLI installed (or use Cloud Console)
- SSH access from your laptop
- ~20-30 minutes per base image build
- Model auth credentials (Anthropic, OpenAI, Gemini API keys)

### Step-by-step base image creation

#### 1) GCP project setup

```bash
gcloud projects create my-openclaw-project --name="OpenClaw Gateway"
gcloud config set project my-openclaw-project
gcloud services enable compute.googleapis.com
```

Enable billing at https://console.cloud.google.com/billing.

#### 2) Create the VM

| Type | Specs | Cost | Notes |
|------|-------|------|-------|
| e2-small | 2 vCPU, 2GB RAM | ~$12/mo | Recommended |
| e2-micro | 2 vCPU (shared), 1GB RAM | Free tier eligible | May OOM under load |

```bash
gcloud compute instances create openclaw-gateway \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --boot-disk-size=20GB \
  --image-family=debian-12 \
  --image-project=debian-cloud
```

#### 3) SSH into the VM

```bash
gcloud compute ssh openclaw-gateway --zone=us-central1-a
```

SSH key propagation can take 1-2 minutes after VM creation.

#### 4) Install Docker (on the VM)

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
# SSH back in for group change:
gcloud compute ssh openclaw-gateway --zone=us-central1-a
docker --version
docker compose version
```

#### 5) Clone OpenClaw and create persistent directories

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
mkdir -p ~/.openclaw
mkdir -p ~/.openclaw/workspace
```

Docker containers are ephemeral. All long-lived state must live on the host via volume mounts.

#### 6) Configure `.env`

Create `.env` in the repository root:

```bash
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_TOKEN=<generate-with-openssl-rand-hex-32>
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_PORT=18789

OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw
OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace

GOG_KEYRING_PASSWORD=<generate-with-openssl-rand-hex-32>
XDG_CONFIG_HOME=/home/node/.openclaw
```

Generate strong secrets: `openssl rand -hex 32`. Do not commit this file.

#### 7) Docker Compose configuration

```yaml
services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE}
    build: .
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - HOME=/home/node
      - NODE_ENV=production
      - TERM=xterm-256color
      - OPENCLAW_GATEWAY_BIND=${OPENCLAW_GATEWAY_BIND}
      - OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}
      - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
      - GOG_KEYRING_PASSWORD=${GOG_KEYRING_PASSWORD}
      - XDG_CONFIG_HOME=${XDG_CONFIG_HOME}
      - PATH=/home/linuxbrew/.linuxbrew/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
    ports:
      # Keep loopback-only; access via SSH tunnel. Remove 127.0.0.1: to expose publicly.
      - "127.0.0.1:${OPENCLAW_GATEWAY_PORT}:18789"
    command:
      [
        "node", "dist/index.js", "gateway",
        "--bind", "${OPENCLAW_GATEWAY_BIND}",
        "--port", "${OPENCLAW_GATEWAY_PORT}",
      ]
```

#### 8) Dockerfile with baked binaries (critical)

Installing binaries at runtime is a trap — they are lost on restart. All external binaries must be baked at image build time.

```dockerfile
FROM node:22-bookworm

RUN apt-get update && apt-get install -y socat && rm -rf /var/lib/apt/lists/*

# Gmail CLI
RUN curl -L https://github.com/nicepkg/gog/releases/latest/download/gog_Linux_x86_64.tar.gz \
  | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/gog

# Google Places CLI
RUN curl -L https://github.com/nicepkg/goplaces/releases/latest/download/goplaces_Linux_x86_64.tar.gz \
  | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/goplaces

# WhatsApp CLI
RUN curl -L https://github.com/nicepkg/wacli/releases/latest/download/wacli_Linux_x86_64.tar.gz \
  | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/wacli

# Add more binaries as needed using the same pattern

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY scripts ./scripts

RUN corepack enable
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm ui:install
RUN pnpm ui:build

ENV NODE_ENV=production
CMD ["node","dist/index.js"]
```

If you add new skills that depend on additional binaries, you must update the Dockerfile, rebuild, and restart.

#### 9) Build and launch

```bash
docker compose build
docker compose up -d openclaw-gateway

# Verify binaries:
docker compose exec openclaw-gateway which gog
docker compose exec openclaw-gateway which goplaces
docker compose exec openclaw-gateway which wacli

# Verify Gateway:
docker compose logs -f openclaw-gateway
# Success: [gateway] listening on ws://0.0.0.0:18789
```

#### 10) Access from your laptop (SSH tunnel)

```bash
gcloud compute ssh openclaw-gateway --zone=us-central1-a -- -L 18789:127.0.0.1:18789
```

Open in browser: `http://127.0.0.1:18789/` and paste gateway token.

#### 11) Create machine image for pool

After verifying the base VM works, create a machine image:

```bash
gcloud compute machine-images create openclaw-base-image \
  --source-instance=openclaw-gateway \
  --source-instance-zone=us-central1-a
```

### Persistence reference

| Component | Location | Mechanism | Notes |
|-----------|----------|-----------|-------|
| Gateway config | `/home/node/.openclaw/` | Host volume mount | Includes `openclaw.json`, tokens |
| Model auth profiles | `/home/node/.openclaw/` | Host volume mount | OAuth tokens, API keys |
| Skill configs | `/home/node/.openclaw/skills/` | Host volume mount | Skill-level state |
| Agent workspace | `/home/node/.openclaw/workspace/` | Host volume mount | Code and agent artifacts |
| WhatsApp session | `/home/node/.openclaw/` | Host volume mount | Preserves QR login |
| Gmail keyring | `/home/node/.openclaw/` | Host volume + password | Requires `GOG_KEYRING_PASSWORD` |
| External binaries | `/usr/local/bin/` | Docker image | Must be baked at build time |
| Node runtime | Container filesystem | Docker image | Rebuilt every image build |
| OS packages | Container filesystem | Docker image | Do not install at runtime |
| Docker container | Ephemeral | Restartable | Safe to destroy |

### Updating OpenClaw on VMs

```bash
cd ~/openclaw
git pull
docker compose build
docker compose up -d
```

### Troubleshooting

- **SSH refused**: Key propagation takes 1-2 minutes after VM creation. Wait and retry.
- **OS Login issues**: Check `gcloud compute os-login describe-profile` and IAM permissions.
- **OOM on e2-micro**: Upgrade to e2-small: stop VM → `gcloud compute instances set-machine-type ... --machine-type=e2-small` → start VM.

### Service accounts (for automation)

```bash
gcloud iam service-accounts create openclaw-deploy \
  --display-name="OpenClaw Deployment"

gcloud projects add-iam-policy-binding my-openclaw-project \
  --member="serviceAccount:openclaw-deploy@my-openclaw-project.iam.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1"
```

### Instance pool model (CloseClaw-specific)

OpenClaw instances are GCP VMs created from the machine image above.

Pool management uses GCP instance tags and Supabase DB:

- **Unclaimed**: VM is running, Gateway is up, no user assigned → tag: `pool-available`
- **Claimed**: VM is assigned to a user → tag: `pool-claimed-{userId}`

Lifecycle (simplified for MVP):

```
VM_CREATED → AVAILABLE → CLAIMED → ACTIVE
```

Rules:

- One VM per user
- No shared instances
- Claiming must be atomic (DB transaction + GCP tag update)
- OpenClaw Gateway ports are never publicly exposed
- Backend connects to VMs via Tailscale internal IPs (no SSH tunnels in production)
- Each VM auto-joins Tailscale mesh on boot using `TAILSCALE_AUTHKEY`
- Backend is the only ingress
- Agents must not bypass the pool

### Tailscale networking

All GCP VMs run Tailscale and auto-join the mesh on startup. The CloseClaw backend (also on Tailscale) connects to each Gateway at `http://<tailscale-ip>:18789`.

This eliminates:
- Public IP exposure on VMs
- SSH tunnel management
- Firewall rule complexity

VM startup script installs and authenticates Tailscale:

```bash
# Included in machine image or startup script
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=$TAILSCALE_AUTHKEY --hostname=openclaw-$INSTANCE_ID
```

The backend resolves each VM's Tailscale IP from `tailscale status` or stores it in the `instances` DB table at claim time.

## Gateway internals (CloseClaw integration reference)

### Gateway bind modes

The Gateway supports these bind modes (`--bind` flag or `gateway.bind` config):

| Mode | Listens on | Use case |
|------|-----------|----------|
| `loopback` | `127.0.0.1:18789` | Default, local-only access |
| `lan` | `0.0.0.0:18789` | LAN access (used in docker-compose) |
| `tailnet` | `<tailscale-ip>:18789` | **CloseClaw production mode** — listens only on Tailscale IP |
| `auto` | Prefers loopback | Not useful for CloseClaw |

**CloseClaw VMs must use `bind: tailnet`** so the Gateway listens on its Tailscale IP. The backend connects via `ws://<tailscale-ip>:18789`. No public IP exposure.

Gateway config for CloseClaw VMs (`~/.openclaw/openclaw.json`). Note: the `token` field is auto-populated by `openclaw onboard --non-interactive --flow quickstart`:

```json5
{
  gateway: {
    mode: "local",
    port: 18789,
    bind: "tailnet",
    auth: {
      mode: "token",
      // token is generated by `openclaw onboard` — do not hardcode
      // NOTE: allowTailscale identity auth does NOT work with bind: tailnet
      // (it requires Tailscale Serve proxy which injects identity headers).
      // With bind: tailnet, use token auth exclusively.
    },
    controlUi: { enabled: true },
    reload: { mode: "hybrid" },
  },
}
```

### Control UI

The Gateway serves a built-in **Vite + Lit SPA** at `http://<host>:18789/`. It speaks directly to the Gateway WebSocket on the same port.

**What it does:**
- Chat with the agent (`chat.send`, `chat.history`, `chat.abort`)
- Channel status + QR login + per-channel config
- Cron jobs: list/add/run/enable/disable
- Skills: status, enable/disable, install
- Config: view/edit `openclaw.json` (form from schema + raw JSON editor)
- Debug: status/health/models snapshots + event log
- Logs: live tail with filter/export

**CloseClaw integration:** The CloseClaw dashboard should **not** replicate the Control UI. Instead, proxy or link to it. The user's WS connection from CloseClaw's frontend can reach the Gateway's Control UI via the backend WS proxy.

**Auth for Control UI:**
- Token auth: `connect.params.auth.token` in the WS handshake
- Tailscale identity: auto-auth via `tailscale-user-login` header (only works with `tailscale serve`, NOT with `bind: tailnet`)
- Local (`127.0.0.1`): auto-approved for device pairing
- Remote: requires **device pairing** (see below)

**WS connect scopes:** The `connect` message includes `role` (default `"operator"`) and `scopes` array (default `["operator.admin"]`). The `operator.admin` scope grants access to ALL methods including `config.*`, `wizard.*`, `cron.*`, `sessions.*`, `update.*`. Other scopes: `operator.read` (health, status, config.get), `operator.write` (chat.send, send, agent), `operator.pairing` (node.pair.*, device.pair.*), `operator.approvals` (exec.approval.*).

### Config management via RPC

The Gateway supports runtime config changes via WebSocket RPC:

**`config.patch`** (partial update — CloseClaw uses this):
```json
{
  "method": "config.patch",
  "params": {
    "raw": "{ channels: { telegram: { enabled: true, botToken: \"123:abc\", dmPolicy: \"pairing\" } } }",
    "baseHash": "<hash-from-config.get>"
  }
}
```
- JSON merge-patch semantics (objects merge, `null` deletes, arrays replace)
- Requires `baseHash` for optimistic concurrency (get it from `config.get`)
- After writing, triggers a **SIGUSR1 soft restart** (gateway reloads config, channels reconnect)
- Channel config changes apply without full process restart

**`config.apply`** (full replace — avoid this):
- Replaces entire config, triggers restart
- Only use for initial setup if needed

**`config.get`**:
- Returns current config + `hash` for use as `baseHash`

**Config hot-reload**: Channel changes, model changes, agent settings all apply via SIGUSR1 soft restart (sub-second). Only `gateway.*` changes (port, bind, auth, tailscale) need a hard restart.

### DM pairing (channel access control)

When a channel is set to `dmPolicy: "pairing"` (default), unknown senders receive a **pairing code** and their message is not processed until approved.

**Pairing codes:**
- 8 characters, uppercase, no ambiguous chars
- Expire after 1 hour
- Max 3 pending requests per channel

**Approve:**
```bash
# Inside the Docker container on the VM:
docker compose exec openclaw-gateway node dist/index.js pairing list telegram
docker compose exec openclaw-gateway node dist/index.js pairing approve telegram <CODE>
```

> [!CAUTION]
> **DM pairing has NO WS RPC method.** The `approveChannelPairingCode()` function in `pairing-store.ts` reads/writes disk files directly (`~/.openclaw/credentials/<channel>-pairing.json` and `<channel>-allowFrom.json`). It can only be invoked via the CLI running on the same machine. The `node.pair.*` and `device.pair.*` WS RPC methods handle **device/node identity pairing** — a completely different system for pairing macOS devices, iOS nodes, etc.

**CloseClaw alternatives for DM access control:**

| Approach | How | Pros | Cons |
|---|---|---|---|
| **`dmPolicy: "open"` + `allowFrom: ["*"]`** | Via `config.patch` | Simple, no pairing needed, works via WS RPC | Zero access control, anyone can DM the bot |
| **Pre-populate `allowFrom`** | Set `allowFrom: ["<user-id>"]` via `config.patch` | Full WS RPC, narrowed access | Requires knowing user's platform-specific sender ID upfront |
| **Custom Gateway extension** | Add a WS RPC handler for `pairing.approve` | Clean, uses existing pairing system | Requires forking/extending OpenClaw Gateway |
| **SSH exec** | `ssh <vm> docker exec ... openclaw pairing approve ...` | Works with stock Gateway | Requires SSH access, defeats WS-only architecture |

**CloseClaw recommendation:** Use `dmPolicy: "open"` + `allowFrom: ["*"]` for MVP. Each user has their own dedicated VM, so "open" means only the user (who controls the bot token) can message the bot. Access control is implicitly handled by bot token ownership.

**State storage:** `~/.openclaw/credentials/<channel>-pairing.json` and `<channel>-allowFrom.json` (host volume, persists across container restarts).

### Device pairing (Control UI access from remote)

When connecting to Control UI from a new browser/device (not localhost), the Gateway requires **device pairing**:

- "disconnected (1008): pairing required"
- Approve: `openclaw devices approve <requestId>`
- Local connections (`127.0.0.1`) are auto-approved
- Each browser profile generates a unique device ID

**CloseClaw implication:** The backend's WS connection to the Gateway is raw WS RPC with token auth — **not** a Control UI connection. Device pairing is only required for Control UI browser clients, not for backend WS RPC.

The backend connects with `role: "operator"`, `scopes: ["operator.admin"]` (the default), and `auth.token` in the `connect` message. This grants full access to all RPC methods including `config.get`, `config.patch`, `channels.status`, `health`, etc.

> **Note:** `allowTailscale` identity auth does NOT work with `bind: tailnet`. Tailscale identity auth requires `tailscale serve` proxy (which injects `tailscale-user-login` headers). With `bind: tailnet`, the Gateway binds directly to the Tailscale IP — no proxy, no identity headers. Use **token auth exclusively**.

### VM bootstrap flow (source-verified)

The full end-to-end sequence from empty VM to accepting CloseClaw backend WS RPC connections:

**Step 1: Docker setup** (`docker-setup.sh`)
1. Create persistent dirs: `~/.openclaw`, `~/.openclaw/workspace`
2. Auto-generate gateway token: `openssl rand -hex 32` → `OPENCLAW_GATEWAY_TOKEN` env var
3. Write `.env` with all config (dirs, ports, bind mode, token, image name)
4. Build Docker image from `Dockerfile`

**Step 2: Non-interactive onboarding** (inside the container)
```bash
docker compose exec openclaw-gateway node dist/index.js onboard \
  --non-interactive \
  --flow quickstart \
  --accept-risk \
  --gateway-auth token \
  --gateway-bind tailnet
```

What this does internally (`onboard-non-interactive/local.ts` → `gateway-config.ts`):
1. Reads existing config from `~/.openclaw/openclaw.json` (or starts empty)
2. Sets `gateway.mode: "local"` + workspace dir
3. Applies auth: if `--gateway-token` provided, uses that; otherwise `randomToken()` generates one
4. Writes token into config at `gateway.auth.token`
5. Writes full config via `writeConfigFile()` to `~/.openclaw/openclaw.json`
6. Creates workspace dirs and session store
7. Optionally waits for gateway reachable + runs health check

**Token resolution chain** (`resolveGatewayAuth()` in `gateway/auth.ts`):
```
gateway.auth.token (from openclaw.json) → OPENCLAW_GATEWAY_TOKEN (env var) → undefined (fails if bind ≠ loopback)
```
Both paths work. For CloseClaw VMs, the recommended approach is:
- **Pre-bake config** with `gateway.auth.mode: "token"` (no token value)
- **Set `OPENCLAW_GATEWAY_TOKEN`** in Docker env (generated and stored by CloseClaw backend in Supabase)
- Gateway resolves token from env var at startup

**Step 3: Start the gateway**
```bash
docker compose up -d openclaw-gateway
# Runs: node dist/index.js gateway --bind tailnet --port 18789
```

What `startGatewayServer()` does (`gateway/server.impl.ts`):
1. Reads + validates config (`readConfigFileSnapshot()`)
2. Migrates any legacy config entries
3. Auto-enables plugins from env vars
4. Resolves bind host (for `tailnet`: Tailscale IPv4 in 100.64.0.0/10)
5. Resolves auth (config + env merge via `resolveGatewayAuth()`)
6. **Validates: non-loopback bind requires token or password** (hard fail otherwise)
7. Creates WS server, HTTP server, channel manager, node registry
8. `attachGatewayWsHandlers()` — registers all RPC method handlers + WS connection handling
9. Starts sidecars: channels, cron, heartbeat, Bonjour discovery, Tailscale exposure
10. **Gateway is now listening and ready for WS RPC connections**

**Step 4: CloseClaw backend connects**
```
ws://<vm-tailscale-ip>:18789
→ connect { role: "operator", scopes: ["operator.admin"], auth: { token: "<token>" } }
→ authenticated → can call config.get, config.patch, channels.status, health
```

> **Critical: no agent/device pairing is needed.** The Gateway starts, initializes the WS server, and accepts token-authenticated connections immediately. Device pairing (`node.pair.*`) is only triggered when external macOS/iOS desktop nodes connect — it's initiated BY those nodes and is completely irrelevant to backend WS RPC. "Agent" and "Gateway" are the same process — there's no separate agent that needs to "pair with" the gateway.

Pre-baked config template for machine image:

```json5
{
  gateway: {
    mode: "local",
    bind: "tailnet",
    auth: { mode: "token" },  // token resolved from OPENCLAW_GATEWAY_TOKEN env
    controlUi: { enabled: true },
    reload: { mode: "hybrid" },
  },
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "google/gemini-3-flash-preview",
        fallbacks: ["anthropic/claude-4.6-sonnet", "openai/gpt-5.2-codex"],
      },
      models: {
        "google/gemini-3-flash-preview": { alias: "Gemini" },
        "anthropic/claude-4.6-sonnet": { alias: "Sonnet" },
        "openai/gpt-5.2-codex": { alias: "Codex" },
      },
    },
  },
  session: { dmScope: "per-channel-peer" },
}
```

### Channel setup via config.patch (the CloseClaw flow)

When the user provides a bot token in the CloseClaw UI:

1. Backend connects to Gateway WS at `ws://<tailscale-ip>:18789` with token auth
2. Backend calls `config.get` to get current config + hash
3. Backend calls `config.patch` with the channel config:

**Telegram:**
```json5
{ channels: { telegram: { enabled: true, botToken: "<user-token>", dmPolicy: "open", allowFrom: ["*"] } } }
```

**Discord:**
```json5
{ channels: { discord: { enabled: true, token: "<user-token>", dmPolicy: "open", allowFrom: ["*"], dm: { enabled: true } } } }
```

**Slack (requires 2 tokens):**
```json5
{ channels: { slack: { enabled: true, botToken: "<xoxb-token>", appToken: "<xapp-token>", dmPolicy: "open", allowFrom: ["*"], dm: { enabled: true } } } }
```

4. Gateway applies config via SIGUSR1 soft restart (sub-second)
5. Channel is live — user can start messaging their bot immediately (no pairing step needed)

## User flow

### Landing → Agent setup

1. User visits landing page
2. User logs in via Supabase Google OAuth
3. User sees channel buttons (Telegram, Discord, Slack) on the landing page
4. User clicks preferred channel button
5. Mock billing modal appears (select plan: $50 / $75 / $100)
6. Instance is claimed from the pool (GCP VM assigned to user)
7. Channel setup modal opens:

### Channel setup modal (single-step)

**Token entry:**
- Left side: Clear instructions for creating a bot/app (channel-specific)
- Right side: Token input field(s) — 1 for Telegram/Discord, 2 for Slack (bot + app token)
- On submit: Backend connects to Gateway via Tailscale WS, calls `config.get` → `config.patch` with `dmPolicy: "open"` + `allowFrom: ["*"]` → channel goes live
- Flow: User creates their bot → enters token → we enable channel via `config.patch` with `dmPolicy: "open"` → channel starts immediately → setup complete (no pairing needed)

### Channel-specific token instructions

**Telegram:** User creates a bot via @BotFather, gets a bot token.
**Discord:** User creates an app in Discord Developer Portal, adds a bot, enables Message Content Intent, copies bot token.
**Slack:** User creates a Slack app with Socket Mode, gets App Token (`xapp-...`) and Bot Token (`xoxb-...`).

### Post-setup

User enters the dashboard with access to:
- **Connections tab**: Connect/disconnect channels. Shows Telegram, Discord, Slack as active. Other channels (WhatsApp, Signal, iMessage, etc.) shown as "upcoming" with disabled state.
- **Cron tab**: Manage cron jobs via RPC
- **Usage tab**: View usage metrics via RPC

## Backend architecture (Hono)

### Framework

- Hono running on Node.js
- RESTful HTTP endpoints for auth, billing, instance management
- WebSocket proxy to forward user connections to their OpenClaw Gateway

### WebSocket model

- Single WebSocket connection per user
- The backend proxies the WS connection directly to the user's OpenClaw Gateway
- All RPC calls (channel add/remove, pairing, cron, usage) go through this single connection
- The backend authenticates the user via Supabase JWT before establishing the WS proxy

### Key endpoints

- `POST /auth/callback` — Supabase OAuth callback
- `GET /api/instance` — Get user's instance status
- `POST /api/instance/claim` — Claim an instance from the pool
- `POST /api/instance/approve-pairing` — SSH into VM to run approve command
- `WS /ws` — WebSocket proxy to user's Gateway
- `POST /api/billing/checkout` — Mock billing (returns success)
- `GET /api/billing/plans` — Return plan tiers

### Pairing approval flow (backend)

When user submits a pairing code:

1. Backend validates user session (Supabase JWT)
2. Looks up user's assigned VM IP from Supabase DB
3. SSHs into the VM using a service account key
4. Runs: `docker exec openclaw-gateway openclaw approve pairing <channel> <code>`
5. Captures output, validates success
6. Returns result to frontend

Rules:
- Strict allowlist of commands only (only `openclaw approve pairing`)
- No shell passthrough
- Output captured and validated
- Users never receive SSH or VM access

## Database schema (Supabase Postgres)

### Tables

```sql
-- Users (managed by Supabase Auth, extended with profile)
users (
  id UUID PRIMARY KEY REFERENCES auth.users,
  email TEXT,
  display_name TEXT,
  plan TEXT DEFAULT 'none',        -- 'basic' | 'pro' | 'enterprise' | 'none'
  infra_credits DECIMAL DEFAULT 0,
  api_credits DECIMAL DEFAULT 0,
  created_at TIMESTAMPTZ
)

-- Instances
instances (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  gcp_instance_name TEXT,
  gcp_zone TEXT,
  internal_ip TEXT,
  external_ip TEXT,
  gateway_port INTEGER DEFAULT 18789,
  gateway_token TEXT,
  status TEXT DEFAULT 'available',  -- 'available' | 'claimed' | 'active' | 'error'
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Channel connections (tracks which channels a user has configured)
channel_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  instance_id UUID REFERENCES instances,
  channel TEXT,                     -- 'telegram' | 'discord' | 'slack'
  status TEXT DEFAULT 'pending',    -- 'pending' | 'paired' | 'active' | 'error'
  created_at TIMESTAMPTZ
)
```

## API keys and secrets

All API keys are operator-provided and stored in `.env`. Users never provide their own model API keys.

Keys are injected into each OpenClaw instance at image build time or via environment variables:

- `GEMINI_API_KEY` — Google Gemini (primary model: `google/gemini-3-flash-preview`)
- `ANTHROPIC_API_KEY` — Anthropic (`anthropic/claude-4.6-sonnet`)
- `OPENAI_API_KEY` — OpenAI (`openai/gpt-5.2-codex`)
- `GOG_KEYRING_PASSWORD` — Gmail keyring
- `OPENCLAW_GATEWAY_TOKEN` — Per-instance gateway token (generated by `openclaw onboard`, unique per VM)

Supabase keys:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Frontend
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Backend

LemonSqueezy is configured but billing is mocked for now.

## Design system (non-negotiable)

CloseClaw must visually match OpenClaw.ai and follow the dark nebula aesthetic used by OpenClaw, SimpleClaw, and Ampere.

### Core rules

- Dark nebula background only
- No white or light backgrounds
- No borders; glow and opacity only
- All UI built from reusable primitives
- No one-off or custom components
- Mac traffic-light modal style everywhere

### Design tokens (source of truth)

**Colors:**
- bgRoot: `#07080C`
- surfaceBase: `rgba(255,255,255,0.03)`
- surfaceHover: `rgba(255,255,255,0.06)`
- textPrimary: `#ECEEF3`
- textSecondary: `#9AA0AA`
- accentPrimary: `#FF5A5F` (OpenClaw coral)
- accentGlow: `rgba(255,90,95,0.45)`

**Motion:**
- Duration: 150–250ms
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`
- No bounce, no elastic, no sharp easing

### Background component (required)

All pages must include the OpenClaw-style nebula background:
- Layered radial gradients
- Subtle noise
- Fixed, non-scrolling
- Never replaced with images

### Allowed UI components only

All UI must be composed from these primitives only:

**Card** — Glass surface, backdrop blur, no borders

**Button** — primary (coral), secondary (glass), ghost (text only)

**Modal** — Mac traffic-light controls (red / yellow / green), no close icons, centered, rounded. Used for all dialogs.

**Stepper** — Horizontal onboarding flow, animated progress, no exposed step numbers

**Icon cluster** — Floating icons around a central node. Used for channels and integrations.

If a UI element cannot be built from these, it must not exist.

## Copy and onboarding tone

Text must follow SimpleClaw-style copy:
- Short sentences
- No jargon
- No buzzwords
- Emphasis on speed and simplicity

Canonical phrases:
- "Your OpenClaw agent, running in under 60 seconds."
- "No setup. No servers. No API keys."
- "Connect a channel and start."
- "Your agent runs in its own isolated instance."

Do not introduce verbose explanations in the UI.

## Architecture rules

### SOLID / OOP

- One class = one responsibility
- Depend on interfaces, not implementations
- Extend behavior via new adapters, not edits
- Channel integrations must use the Adapter pattern

### WebSocket RPC model

This is a WebSocket-first system.

All user actions use RPC over WSS (proxied to their Gateway):
- Channel add / remove (`config.patch()`)
- Pairing approval (via backend SSH)
- Cron jobs
- Usage queries
- Instance status

Rules:
- One socket per user (proxied to their Gateway)
- Request/response with correlation IDs
- Server is authoritative
- Unknown RPCs are rejected

### Channel management

**Add / remove:**
- Must use OpenClaw `config.patch()` via RPC
- Never edit config files directly

**Pairing approval:**
- Some channels require approval: `openclaw approve pairing <channel> <code>`
- Executed inside the user's VM via controlled SSH
- Strict allowlist only
- No shell passthrough
- Output captured and validated
- Users never receive SSH or VM access

## Authentication

- Supabase Google OAuth only
- JWT validated server-side
- Supabase is the identity source of truth
- No alternative auth methods
- Never trust frontend state alone

## Billing (mocked for MVP)

Three tiers with partial credits:

| Plan | Price | Infra Credits | API Credits |
|------|-------|---------------|-------------|
| Basic | $50 | $50 | $20 |
| Pro | $75 | $75 | $30 |
| Enterprise | $100 | $100 | $50 |

LemonSqueezy is integrated but billing flow is mocked — checkout always returns success. Real billing integration comes later.

## Cron jobs

- Managed via RPC only (proxied to Gateway)
- Validated server-side
- Namespaced per user and instance
- Persist across restarts
- No direct crontab access

## Usage and metrics

- Queried via RPC (proxied to Gateway)
- Aggregated server-side
- Scoped strictly to the authenticated user
- Never read directly by the frontend from containers

## Security requirements

- TLS everywhere
- No user-provided API keys (operator provides all model keys)
- No arbitrary command execution
- Strict schema validation
- Rate-limit HTTP and WebSocket endpoints
- Assume malicious clients by default
- If uncertain, fail closed

## Testing instructions

Run before committing:

```bash
npm test
npm run lint
```

Must cover:
- Instance claim race conditions
- WebSocket auth and reconnects
- Channel adapter isolation
- Pairing approval flow
- Cron persistence

## PR instructions

- Title format: `[CloseClaw] <short description>`
- Do not introduce new UI primitives
- Do not weaken security or WebSocket auth
- Do not change design tokens without updating this file
- Update AGENTS.md if architecture or behavior changes

## Agent guidance

This project prioritizes:
- Design fidelity over experimentation
- Isolation over efficiency
- Predictability over cleverness

If something is not explicitly defined here, do not invent it.