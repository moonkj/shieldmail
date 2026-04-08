# ShieldMail — Release Checklist

> Use this document for every release. Complete each section top-to-bottom.
> Tag the release commit **after** all boxes are checked.

---

## 0. Pre-flight (all targets)

- [ ] `git status` is clean on `main`
- [ ] All tests pass
  ```bash
  cd workers/email-router && npm ci && npm test
  cd extension && npm ci && npm test
  ```
- [ ] Versions bumped in both `package.json` files (`"version": "X.Y.Z"`)
- [ ] `HMAC_KEY` secret is set in Cloudflare dashboard (not in code)
- [ ] `wrangler.toml` KV namespace IDs are real (not `REPLACE_WITH_...`)
- [ ] `DOMAIN_POOL` contains all intended domains

---

## 1. Cloudflare Worker

### Deploy

```bash
cd workers/email-router
npm ci
wrangler deploy --env production
```

### Smoke test

```bash
# 1. Generate alias
RESP=$(curl -s -X POST https://api.shld.me/alias/generate \
  -H "Content-Type: application/json" \
  -d '{"mode":"ephemeral"}')
ALIAS_ID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['aliasId'])")
TOKEN=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['pollToken'])")

# 2. Poll messages (expect empty)
curl -s "https://api.shld.me/alias/$ALIAS_ID/messages?token=$TOKEN"

# 3. SSE stream (Ctrl-C after seeing ": connected")
curl -N "https://api.shld.me/alias/$ALIAS_ID/stream?token=$TOKEN"
```

- [ ] Alias generation returns `{ ok: true, aliasId, address, pollToken }`
- [ ] Poll returns `{ messages: [], expired: false }`
- [ ] SSE stream returns `": connected"` within 2 seconds
- [ ] All 5 domains return valid MX (check via `dig MX d1.shld.me`)

---

## 2. macOS Safari Extension

### Build

```bash
cd extension
npm ci
NODE_ENV=production npm run build
# dist/ is ready — no sourcemaps in production build
```

### Reproducible build hash

```bash
# Record the hash of the production bundle for the release notes.
find dist/ -type f | sort | xargs sha256sum > dist/BUILD_MANIFEST.txt
cat dist/BUILD_MANIFEST.txt
```

### Xcode packaging

1. Open `extension/dist/` in Xcode via **File → New → Project → Safari Extension App**
   (wrap `dist/` as the extension resources bundle)
2. Set **Bundle Identifier**: `me.shld.ShieldMail`
3. Set **Deployment Target**: macOS 13.0
4. **Product → Archive**
5. **Distribute App → Developer ID** (for direct distribution) **or** **App Store Connect**

### Signing & Notarization (direct distribution)

```bash
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: <YOUR_TEAM>" \
  ShieldMail.app

xcrun notarytool submit ShieldMail.zip \
  --apple-id <APPLE_ID> \
  --team-id <TEAM_ID> \
  --password <APP_SPECIFIC_PASSWORD> \
  --wait

xcrun stapler staple ShieldMail.app
```

- [ ] Build succeeds with no TypeScript errors (`npm run typecheck`)
- [ ] All extension tests pass (`npm test`)
- [ ] Content script injects shield icon on a real signup form
- [ ] Alias generation works end-to-end in Safari
- [ ] OTP appears in popup within 30 seconds of email arrival
- [ ] OS notification body does **not** contain the OTP (privacy check)
- [ ] App notarized and stapled (direct distribution) or uploaded to App Store Connect

---

## 3. iOS Safari Extension

### Generate Xcode project

```bash
brew install xcodegen   # if not installed
cd ios
xcodegen generate       # creates ShieldMail.xcodeproj
```

### Build & archive in Xcode

1. Open `ios/ShieldMail.xcodeproj`
2. Select scheme **ShieldMail** → Any iOS Device
3. **Product → Archive**
4. **Distribute App → App Store Connect**

### TestFlight

- [ ] Build uploaded to App Store Connect
- [ ] Internal testers added and build distributed
- [ ] OTP flow tested on physical iPhone (SE / 14 / 15 sizes)
- [ ] OTP flow tested on iPad (split view — floating button right offset correct)
- [ ] Haptic feedback fires on alias generation
- [ ] Extension persists token across Safari cold launches (Keychain test)

### App Store submission

- [ ] Privacy Nutrition Labels filled in App Store Connect
  - Data Not Linked to You: Browsing History (local only), Emails/Text Messages (≤10 min)
- [ ] `ios/Extension/PrivacyInfo.xcprivacy` included in the archive (verify in Xcode)
- [ ] App Review Notes uploaded (`docs/APP_STORE_REVIEW_NOTES.md`)
- [ ] Test account credentials provided in the Notes field
  - Account: `reviewer@shld.me` / `ShieldMailReview2025`
  - Demo page: `https://demo.shld.me/signup`
- [ ] Screenshots prepared (6.7" / 6.1" / iPad 12.9")

#### Required screenshots (6 per device size)
1. Shield icon on a signup form
2. Alias injected into the email field
3. Popup — OTP received
4. Popup — Managed Mode alias list
5. iOS floating button (iPhone)
6. Onboarding screen (Safari activation guide)

---

## 4. Open Source Release

- [ ] `LICENSE` file present at repo root (MIT)
- [ ] `README.md` up to date
- [ ] No secrets committed (`git log --all -- .env` returns empty)
- [ ] `node_modules/`, `dist/`, `.wrangler/` excluded by `.gitignore`
- [ ] `package-lock.json` committed for both packages (run `npm install` + commit)

### Tag

```bash
git tag -a v0.1.0 -m "ShieldMail v0.1.0 — M5 initial release"
git push origin main --tags
```

### GitHub Release

- [ ] Release notes written (highlights: privacy model, 5-domain pool, SSE real-time, iOS+macOS)
- [ ] macOS `.app` zip attached as release asset
- [ ] iOS IPA link (TestFlight public link) in release notes

---

## 5. Post-release

- [ ] Monitor Cloudflare Workers analytics for error rate spikes (first 24 hours)
- [ ] Verify Email Routing catch-all is active for all 5 domains
- [ ] Check DO alarm is firing correctly (KV should be empty after 10 min)
- [ ] Archive this checklist with release date and version number
