# ShieldMail — Build Scripts

Reproducible build entry points for the iOS and macOS Safari Web Extension Apps.

Both scripts:
1. Build `extension/dist/` (production, no demo fallback, no diag pages)
2. Run `xcodegen generate` against the platform's `project.yml`
3. `xcodebuild archive` and export the artifact

The scripts are intentionally **idempotent** — running them twice produces the
same `.app` / `.ipa`. They are also CI-safe: they read all secrets from env
vars and never print them.

---

## `build-macos.sh`

Builds `macos/ShieldMail.app` and optionally signs + notarizes.

```bash
# Local unsigned dev build (open the resulting .app to test)
./scripts/build-macos.sh

# Signed build (requires Apple Developer Program)
APPLE_TEAM_ID=QN975MTM7H \
CODESIGN_IDENTITY="Developer ID Application: Your Name (QN975MTM7H)" \
./scripts/build-macos.sh

# Signed + notarized + stapled (gatekeeper-friendly distribution)
APPLE_TEAM_ID=QN975MTM7H \
CODESIGN_IDENTITY="Developer ID Application: Your Name (QN975MTM7H)" \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop" \
NOTARIZE=1 \
./scripts/build-macos.sh
```

Output: `build/macos/ShieldMail.app`

---

## `build-ios.sh`

Builds `ios/ShieldMail.ipa` for device install or App Store Connect.

```bash
# Local dev build (debugging method — use with `xcrun devicectl device install app`)
APPLE_TEAM_ID=QN975MTM7H ./scripts/build-ios.sh

# App Store / TestFlight build + upload
APPLE_TEAM_ID=QN975MTM7H \
EXPORT_METHOD=app-store-connect \
APPLE_ID=you@example.com \
APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop" \
UPLOAD_TO_APP_STORE=1 \
./scripts/build-ios.sh
```

Output: `build/ios/ShieldMail.ipa`

---

## Apple credentials — how to get them

1. **`APPLE_TEAM_ID`**: developer.apple.com → Account → Membership → Team ID
2. **`CODESIGN_IDENTITY`** (macOS only):
   ```bash
   security find-identity -v -p codesigning
   ```
   Copy the full string in quotes, e.g. `"Developer ID Application: Name (XXXXXXXXXX)"`.
3. **`APPLE_ID`**: your Apple ID email.
4. **`APPLE_APP_SPECIFIC_PASSWORD`**: account.apple.com → Sign-In and Security
   → App-Specific Passwords → Generate. Format: `xxxx-xxxx-xxxx-xxxx`.

---

## CI integration

These scripts run inside `.github/workflows/release.yml` (TODO) on a `macos-15`
runner. Secrets are stored in repo settings as Actions secrets:

| Secret name                    | Source                                                  |
|--------------------------------|---------------------------------------------------------|
| `APPLE_TEAM_ID`                | developer.apple.com                                     |
| `CODESIGN_IDENTITY`            | full identity string                                     |
| `APPLE_ID`                     | Apple ID email                                           |
| `APPLE_APP_SPECIFIC_PASSWORD`  | account.apple.com → app-specific passwords              |
| `MACOS_CERT_BASE64`            | `base64 -i developer-id.p12` of the .p12 export         |
| `MACOS_CERT_PASSWORD`          | password used when exporting the .p12                   |

The CI keychain import step is left as a follow-up — see the comments in
`.github/workflows/ci.yml` for the unsigned build path that runs today.
