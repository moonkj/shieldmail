# ShieldMail

**Disposable email aliases for every signup — built into Safari.**

ShieldMail generates a unique `@shld.me` alias whenever you're about to fill in an email field. OTPs and verification links appear directly in the extension popup, so your real inbox stays clean and your identity stays private.

---

## How it works

```
You type into a signup form
      ↓
ShieldMail detects the email field (content script)
      ↓
Click the shield icon → alias generated (Cloudflare Worker API)
      ↓
Alias injected into the field
      ↓
Signup email arrives → Cloudflare Email Routing → Email Worker
      ↓
OTP / link extracted → Durable Object (10-min buffer)
      ↓
Popup shows the code — copy with one click
```

No email server to operate. No long-term storage. OTPs auto-delete after 10 minutes.

---

## Project layout

```
ShieldMail/
├── workers/email-router/   Cloudflare Worker (API + Email + Durable Objects)
├── extension/              Safari Web Extension (macOS + iOS, TypeScript + Preact)
├── ios/                    Swift native container (XcodeGen project.yml)
├── assets/icons/           SVG shield+envelope icons
└── docs/                   ARCHITECTURE.md · UX_SPEC.md · PRIVACY_POLICY.md
```

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| pnpm / npm | any recent |
| Wrangler CLI | ≥ 3 |
| Xcode | ≥ 15 (iOS build only) |
| XcodeGen | ≥ 2.40 (iOS build only) |

---

## Backend — Cloudflare Worker

### 1. Install

```bash
cd workers/email-router
npm install
```

### 2. Configure

Edit `wrangler.toml`:
- Replace `REPLACE_WITH_REAL_KV_NAMESPACE_ID` with your KV namespace ID
- Replace `REPLACE_WITH_REAL_KV_PREVIEW_ID` with your preview KV namespace ID
- Uncomment and update `routes` with your actual zone

Create a KV namespace if you don't have one:
```bash
wrangler kv:namespace create ALIAS_KV
```

Set required secrets:
```bash
wrangler secret put HMAC_KEY   # random 32-byte hex string
```

### 3. Email Routing

In the Cloudflare dashboard:
1. Enable **Email Routing** for each domain (`d1.shld.me` … `d5.shld.me`)
2. Set a **catch-all** rule: *Send to Worker* → `shieldmail-email-router`

The Worker's `email(...)` handler receives all incoming mail automatically.

### 4. Deploy

```bash
wrangler deploy
```

### 5. Test

```bash
# Generate an alias
curl -X POST https://api.shld.me/alias/generate \
  -H "Content-Type: application/json" \
  -d '{"mode":"ephemeral"}'

# Poll messages (use the pollToken from the response)
curl "https://api.shld.me/alias/<aliasId>/messages?token=<pollToken>"
```

---

## Extension — macOS Safari

### Build

```bash
cd extension
npm install
npm run build          # outputs to dist/
```

### Load in Safari (development)

1. Open **Safari → Settings → Advanced → Show features for web developers**
2. **Develop → Allow Unsigned Extensions**
3. Drag `extension/dist/` into Safari's extension list

For a signed build, wrap `dist/` in a `.app` bundle using Xcode's Safari Web Extension template and sign with your Apple Developer certificate.

---

## Extension — iOS Safari

### Generate Xcode project

```bash
brew install xcodegen
cd ios
xcodegen generate   # creates ShieldMail.xcodeproj
```

### Build & run

Open `ios/ShieldMail.xcodeproj` in Xcode, select your target device, and run. The app shows an onboarding screen with instructions to enable the extension in **Safari Settings**.

### Enable on device

**Settings → Safari → Extensions → ShieldMail → Allow**

---

## Privacy

- OTPs and email content are held in memory for **≤ 10 minutes**, then permanently deleted
- No analytics, no tracking, no third-party SDKs
- Alias addresses and metadata are stored **locally on your device only**
- The only third-party processor is Cloudflare (infrastructure)

Full policy: [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)

---

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design, data-flow diagrams, privacy threat model, and milestone roadmap.

---

## License

MIT
