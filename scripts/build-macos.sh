#!/usr/bin/env bash
#
# build-macos.sh — build the macOS Safari Web Extension App,
#                  optionally sign + notarize.
#
# Required env (CI or local):
#   APPLE_TEAM_ID                 — 10-char team ID, e.g. QN975MTM7H
#
# Optional env (signing path):
#   CODESIGN_IDENTITY             — "Developer ID Application: ..." (full identity string)
#                                    If unset, the build is unsigned.
#   APPLE_ID                      — Apple ID email used for notarization
#   APPLE_APP_SPECIFIC_PASSWORD   — app-specific password (https://account.apple.com)
#   NOTARIZE                      — "1" to enable notarytool submit + stapler
#
# Output:
#   build/macos/ShieldMail.app
#   build/macos/ShieldMail-${MARKETING_VERSION}.zip   (notarization target)
#
# Usage:
#   ./scripts/build-macos.sh                   # unsigned dev build
#   APPLE_TEAM_ID=… CODESIGN_IDENTITY=… ./scripts/build-macos.sh   # signed
#   APPLE_TEAM_ID=… CODESIGN_IDENTITY=… APPLE_ID=… \
#     APPLE_APP_SPECIFIC_PASSWORD=… NOTARIZE=1 ./scripts/build-macos.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/extension"
MAC_DIR="$ROOT/macos"
BUILD_DIR="$ROOT/build/macos"

cd "$ROOT"

echo "==> [1/5] Build extension dist (production)"
cd "$EXT_DIR"
if [ ! -d node_modules ]; then npm ci; fi
NODE_ENV=production npm run build

echo "==> [2/5] Generate Xcode project (xcodegen)"
cd "$MAC_DIR"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "error: xcodegen not installed. Run: brew install xcodegen"
  exit 1
fi
xcodegen generate

echo "==> [3/5] Archive macOS app"
mkdir -p "$BUILD_DIR"
ARCHIVE="$BUILD_DIR/ShieldMail.xcarchive"
rm -rf "$ARCHIVE"

XCBUILD_ARGS=(
  -project ShieldMail.xcodeproj
  -scheme ShieldMail
  -configuration Release
  -destination "generic/platform=macOS"
  -archivePath "$ARCHIVE"
  archive
)

if [ -n "${CODESIGN_IDENTITY:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  echo "    signing identity: $CODESIGN_IDENTITY"
  XCBUILD_ARGS+=(
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID"
    CODE_SIGN_IDENTITY="$CODESIGN_IDENTITY"
    CODE_SIGN_STYLE=Manual
  )
else
  echo "    (unsigned build — set CODESIGN_IDENTITY + APPLE_TEAM_ID to sign)"
  XCBUILD_ARGS+=(
    DEVELOPMENT_TEAM=""
    CODE_SIGN_IDENTITY=""
    CODE_SIGNING_REQUIRED=NO
    CODE_SIGNING_ALLOWED=NO
  )
fi

xcrun xcodebuild "${XCBUILD_ARGS[@]}"

echo "==> [4/5] Export .app from archive"
EXPORT_DIR="$BUILD_DIR/export"
rm -rf "$EXPORT_DIR"

EXPORT_PLIST="$BUILD_DIR/ExportOptions.plist"
if [ -n "${CODESIGN_IDENTITY:-}" ]; then
  cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>developer-id</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
EOF
  xcrun xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST"
else
  # Unsigned: copy the .app out of the archive directly.
  mkdir -p "$EXPORT_DIR"
  cp -R "$ARCHIVE/Products/Applications/ShieldMail.app" "$EXPORT_DIR/"
fi

cp -R "$EXPORT_DIR/ShieldMail.app" "$BUILD_DIR/"

echo "==> [5/5] Notarize (optional)"
if [ "${NOTARIZE:-}" = "1" ]; then
  if [ -z "${CODESIGN_IDENTITY:-}" ] || [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
    echo "error: notarization requires CODESIGN_IDENTITY + APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID"
    exit 1
  fi

  ZIP_PATH="$BUILD_DIR/ShieldMail.zip"
  rm -f "$ZIP_PATH"
  ditto -c -k --sequesterRsrc --keepParent "$BUILD_DIR/ShieldMail.app" "$ZIP_PATH"

  echo "    submitting to Apple notary service..."
  xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait

  echo "    stapling notarization ticket..."
  xcrun stapler staple "$BUILD_DIR/ShieldMail.app"
  xcrun stapler validate "$BUILD_DIR/ShieldMail.app"

  echo "✓ notarized + stapled: $BUILD_DIR/ShieldMail.app"
else
  echo "    (skipping — set NOTARIZE=1 to submit)"
fi

echo ""
echo "✓ macOS build complete"
echo "  $BUILD_DIR/ShieldMail.app"
