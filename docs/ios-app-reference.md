# CloseClaw iOS App Reference

Last updated: 2026-03-10

## External benchmark: QuickClaw

Reference links:
- https://quickclaw.app/
- https://apps.apple.com/us/app/quickclaw/id6758868107

Observed positioning:
- "Your Own AI Agent in 30 Seconds"
- "No setup · No server · No API keys"
- Native iPhone/iPad app with cloud-hosted private workspace
- Credit-based monetization with in-app purchases

Observed user-facing capabilities:
- Chat-first AI agent experience
- Voice mode
- Skills menu
- File creation and management
- Web browsing and research
- Reminders / wake-up calls / scheduled tasks
- Calendar and email-related actions
- Multi-step autonomous tasks
- Persistent conversation context

Signals worth noting:
- QuickClaw is selling simplicity harder than raw power
- App Store reviews indicate ease-of-use is a major differentiator
- App Store reviews also indicate pricing friction is real
- Recent updates emphasize UX simplification, voice mode, skills, and top-ups

## What CloseClaw already has locally

Existing product surface in this repo:
- Marketing and dashboard web app in `apps/web`
- API server in `apps/api`
- Shared types in `packages/shared`
- Supabase auth already wired for web
- Gateway WebSocket proxy already wired through the backend

Relevant local files:
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/pages/LandingPage.tsx`
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/pages/DashboardPage.tsx`
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/components/chat/ChatTab.tsx`
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/lib/api.ts`
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/lib/gateway.ts`
- `/Users/ashwinn/Projects/closeclaw/apps/web/src/context/AuthContext.tsx`
- `/Users/ashwinn/Projects/closeclaw/apps/api/src/index.ts`
- `/Users/ashwinn/Projects/closeclaw/apps/api/src/routes/auth.ts`

Current CloseClaw features already represented in code:
- Authenticated user account flow via Supabase
- Channel setup for Telegram, Discord, and Slack
- Chat with streamed assistant responses over Gateway WS
- Cron/job management over Gateway RPC
- Usage and credits views
- Billing/top-up placeholders in the web client

Current technical constraints:
- No iOS app target or mobile workspace exists yet
- Auth flow is browser-specific today (`window.location.origin`, OAuth redirect assumptions)
- API client is web-oriented
- Gateway client is browser `WebSocket`-based but portable in concept
- Some billing logic is still mocked in the web app

## Recommended CloseClaw iOS MVP

The first iOS release should compete on setup speed and chat utility, not full dashboard parity.

Prioritize:
1. Sign in / session restore
2. Chat screen with streaming responses
3. Conversation history
4. Credits display
5. Top-up purchase flow
6. Basic settings / account

Second wave:
1. Voice input / voice mode
2. Scheduled tasks / cron templates
3. Files view and download/share
4. Channel connections management
5. Usage breakdown

Defer initially:
- Full desktop-style control dashboard
- Complex channel onboarding inside the first mobile release
- Every existing web settings surface

## Product direction

QuickClaw proves the market wants:
- OpenClaw power without setup pain
- A mobile-native chat loop
- Simple pricing and fast activation

CloseClaw should differentiate on:
- Better reliability and clearer infrastructure trust signals
- Better channel integration story
- Better billing transparency
- Better agent control and observability than QuickClaw's "just chat" posture

## Technical direction

Best path:
- Build a native SwiftUI iOS app
- Reuse the existing backend and Gateway proxy
- Extract shared API contracts from the current web client instead of porting the web UI

Backend work likely needed before the app feels solid:
- Make CORS/origin handling mobile-friendly where relevant
- Ensure auth supports native deep-link redirect flows
- Replace mocked billing endpoints with real mobile-safe billing state
- Define stable mobile DTOs for auth/session/account/credits/chat/history
- Confirm WS proxy auth works cleanly with native clients

## Suggested app information architecture

Tabs:
- Chat
- Tasks
- Credits
- Settings

Chat screen:
- Conversation list or single default thread
- Streaming assistant output
- Composer with voice entry hook
- Attachment/file affordances later

Tasks screen:
- Scheduled jobs
- Preset templates like morning briefing and reminders

Credits screen:
- Balance
- Top-up options
- Recent usage summary

Settings screen:
- Account
- Sign out
- Privacy / support / legal

## Immediate build sequence

1. Create `apps/ios` or `ios/CloseClaw` workspace
2. Implement native Supabase auth flow
3. Port API client and Gateway WS client to Swift
4. Ship chat-first MVP against existing backend
5. Add StoreKit-based top-ups
6. Add tasks and credits management
