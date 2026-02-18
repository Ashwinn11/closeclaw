AGENTS.md
Project overview

CloseClaw is a Vite + React web application with a Node.js backend that provides users with their own isolated OpenClaw agent, running in a dedicated Docker container on GCP in under 60 seconds.

The application:

Wraps OpenClaw

Abstracts all infrastructure and API keys from users

Uses WebSocket RPC for all agent interaction

Supports Telegram, Discord, and Slack

Uses Supabase Google OAuth only

Assigns users a pre-warmed OpenClaw instance from a pool

Setup commands
Local development
npm install
npm run dev        # frontend (Vite)
npm run dev:api    # backend
npm test

Prerequisites

Node.js 20+

npm

Docker + Docker Compose

Supabase project with Google OAuth enabled

Local development must run frontend, backend, and Dockerized OpenClaw together.

Repository structure
/
├─ apps/
│  ├─ web/        # Vite + React frontend
│  └─ api/        # Node.js backend
├─ docker/
│  └─ openclaw/   # OpenClaw Docker image and pool config
├─ packages/
│  └─ shared/     # Shared types and RPC schemas
└─ AGENTS.md


Frontend and backend must remain strictly separated.

Design system (non-negotiable)

CloseClaw must visually match OpenClaw.ai and follow the dark nebula aesthetic used by OpenClaw, SimpleClaw, and Ampere.

Core rules

Dark nebula background only

No white or light backgrounds

No borders; glow and opacity only

All UI built from reusable primitives

No one-off or custom components

Mac traffic-light modal style everywhere

Design tokens (source of truth)
Colors
bgRoot: #07080C
surfaceBase: rgba(255,255,255,0.03)
surfaceHover: rgba(255,255,255,0.06)

textPrimary: #ECEEF3
textSecondary: #9AA0AA

accentPrimary: #FF5A5F   // OpenClaw coral
accentGlow: rgba(255,90,95,0.45)

Motion

Duration: 150–250ms

Easing: cubic-bezier(0.16, 1, 0.3, 1)

No bounce, no elastic, no sharp easing

Background component (required)

All pages must include the OpenClaw-style nebula background:

Layered radial gradients

Subtle noise

Fixed, non-scrolling

Never replaced with images

Allowed UI components only

All UI must be composed from these primitives only:

Card

Glass surface

Backdrop blur

No borders

Button

primary (coral)

secondary (glass)

ghost (text only)

Modal

Mac traffic-light controls (red / yellow / green)

No close icons

Centered, rounded

Used for all dialogs

Stepper

Horizontal onboarding flow

Animated progress

No exposed step numbers

Icon cluster

Floating icons around a central node

Used for channels and integrations

If a UI element cannot be built from these, it must not exist.

Copy and onboarding tone

Text must follow SimpleClaw-style copy:

Short sentences

No jargon

No buzzwords

Emphasis on speed and simplicity

Canonical phrases

“Your OpenClaw agent, running in under 60 seconds.”

“No setup. No servers. No API keys.”

“Connect a channel and start.”

“Your agent runs in its own isolated instance.”

Do not introduce verbose explanations in the UI.

Architecture rules
SOLID / OOP

One class = one responsibility

Depend on interfaces, not implementations

Extend behavior via new adapters, not edits

Channel integrations must use the Adapter pattern

WebSocket RPC model

This is a WebSocket-first system.

All user actions use RPC over WSS:

Channel add / remove

Pairing approval

Cron jobs

Usage queries

Instance status

Rules:

One socket per user

Request/response with correlation IDs

Server is authoritative

Unknown RPCs are rejected

Channel management
Add / remove

Must use OpenClaw config.patch() via RPC

Never edit config files directly

Pairing approval

Some channels require approval:

openclaw approve pairing <channel> <code>


Rules:

Executed inside the user’s Docker container

Via controlled docker exec / kubectl exec

Strict allowlist only

No shell passthrough

Output captured and validated

Users never receive SSH or container access.

Instance pool model

OpenClaw instances are pre-warmed, not created on demand.

Lifecycle:

PREWARMED → AVAILABLE → CLAIMED → ACTIVE → RECYCLED


Rules:

One container per user

No shared instances

Claiming must be atomic

OpenClaw ports are never public

Backend is the only ingress

Agents must not bypass the pool.

Authentication

Supabase Google OAuth only

JWT validated server-side

Supabase is the identity source of truth

No alternative auth methods

Never trust frontend state alone.

Cron jobs

Managed via RPC only

Validated server-side

Namespaced per user and instance

Persist across restarts

No direct crontab access

Usage and metrics

Queried via RPC

Aggregated server-side

Scoped strictly to the authenticated user

Never read directly by the frontend from containers

Security requirements

TLS everywhere

No user-provided API keys

No arbitrary command execution

Strict schema validation

Rate-limit HTTP and WebSocket endpoints

Assume malicious clients by default

If uncertain, fail closed.

Testing instructions

Run before committing:

npm test
npm run lint


Must cover:

Instance claim race conditions

WebSocket auth and reconnects

Channel adapter isolation

Pairing approval flow

Cron persistence

PR instructions

Title format: [CloseClaw] <short description>

Do not introduce new UI primitives

Do not weaken security or WebSocket auth

Do not change design tokens without updating this file

Update AGENTS.md if architecture or behavior changes

Agent guidance

This project prioritizes:

Design fidelity over experimentation

Isolation over efficiency

Predictability over cleverness

If something is not explicitly defined here, do not invent it.