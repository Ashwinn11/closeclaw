# AGENTS.md

## Project overview

CloseClaw is a Vite + React web application with a Hono (Node.js) backend that provides users with their own isolated OpenClaw agent, running in a dedicated GCP Compute Engine VM in under 60 seconds.

Reference openclaw.ai for the full feature set. Official repo is in local directory under `openclaw/`.

Reference sites: simpleclaw.com and ampere.sh (pioneers of OpenClaw wrappers — use for design and UX inspiration only).

The application:

- Wraps OpenClaw
- Abstracts all infrastructure and API keys from users (operator provides all model keys)
- Uses WebSocket RPC for all agent interaction (single WS connection per user to their Gateway)
- Supports Telegram, Discord, and Slack (other channels shown as "upcoming" in dashboard)
- Uses Supabase Google OAuth only
- Uses Supabase Postgres for all data (users, instances, billing)
- Assigns users a GCP VM from a pool (tagged as claimed/unclaimed)
- Mock billing modal with tiers: $50, $75, $100 (partial credits: infra + API credits)

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

### No local Docker

CloseClaw does not use Docker locally. Instead:

1. A GCP machine image is created from a base instance that has OpenClaw + custom binaries pre-installed
2. New VM instances are created from this machine image
3. Each VM runs a Docker container with the OpenClaw Gateway inside
4. The backend SSHs into VMs to execute controlled commands (pairing approval, config patches)

### Machine image creation (one-time setup)

1. Create a base GCP Compute Engine VM (e2-small, Debian 12, 20GB)
2. Install Docker on the VM
3. Clone OpenClaw repo, build the Docker image with all required binaries baked in
4. Configure `.env` with operator-provided API keys (Anthropic, OpenAI, Gemini)
5. Start the OpenClaw Gateway container
6. Create a GCP machine image from this configured VM
7. Use the machine image to spin up new instances for users

### Instance pool model

OpenClaw instances are GCP VMs, not created on demand.

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
- Backend is the only ingress (via SSH tunnel or internal networking)
- Agents must not bypass the pool

## User flow

### Landing → Agent setup

1. User visits landing page
2. User logs in via Supabase Google OAuth
3. User sees channel buttons (Telegram, Discord, Slack) on the landing page
4. User clicks preferred channel button
5. Mock billing modal appears (select plan: $50 / $75 / $100)
6. Instance is claimed from the pool (GCP VM assigned to user)
7. Channel setup modal opens:

### Channel setup modal (two-step)

**Step 1 — Token entry:**
- Left side: Clear instructions for creating a bot/app (channel-specific)
- Right side: Token input field
- On submit: Backend calls `config.patch()` via RPC on the user's Gateway to enable the channel with the provided bot token

**Step 2 — Pairing approval:**
- Left side: Instructions explaining the pairing flow
- Right side: Checkbox "I have sent a message to the bot" + pairing code input
- Flow: User creates their bot → enters token → we enable channel via config.patch → user sends a message to their bot → bot replies with a pairing code → user enters the code → backend SSHs into the VM and runs `openclaw approve pairing <channel> <code>` → setup complete

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

- `OPENAI_API_KEY` — OpenAI
- `GEMINI_API_KEY` — Google Gemini
- `ANTHROPIC_API_KEY` — Anthropic
- `GOG_KEYRING_PASSWORD` — Gmail keyring
- `OPENCLAW_GATEWAY_TOKEN` — Per-instance gateway token (unique per VM)

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