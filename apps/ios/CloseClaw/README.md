# CloseClaw iOS App (MVP Scaffold)

This folder now contains a native SwiftUI MVP scaffold for CloseClaw:

- native Sign in with Apple OAuth against Supabase (`grant_type=id_token`)
- persisted session restore via Keychain
- authenticated API calls to the existing backend (`/api/auth/me`, `/api/billing/credits`)
- Gateway WebSocket client using `/ws?token=<jwt>`
- chat streaming (`chat.history`, `chat.send`, `chat.abort`)
- profile sync to Supabase (`auth.users` metadata + `public.users` display/email)
- tabs: Chat, Tasks, Credits, Settings

## Configure

Set these in `CloseClaw/Resources/Info.plist` (or your own xcconfig setup):

- `CLOSECLAW_API_BASE_URL`
- `CLOSECLAW_SUPABASE_URL`
- `CLOSECLAW_SUPABASE_ANON_KEY`

`Config.template.xcconfig` is included as a reference.

## Generate Project

This project is managed via XcodeGen:

```bash
cd apps/ios/CloseClaw
xcodegen generate
open CloseClaw.xcodeproj
```

If `xcodegen` is not installed:

```bash
brew install xcodegen
```

## Notes

- This is intentionally chat-first and focused on the iOS MVP path.
- StoreKit top-ups and in-app cron creation are not implemented yet.
