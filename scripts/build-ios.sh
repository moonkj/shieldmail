#!/usr/bin/env bash
#
# build-ios.sh — build the iOS Safari Web Extension App,
#                produce an unsigned development build or a signed IPA
#                for App Store / TestFlight upload.
#
# Required env (signing path):
#   APPLE_TEAM_ID                 — 10-char team ID, e.g. QN975MTM7H
#
# Optional env:
#   EXPORT_METHOD                 — "debugging" (dev install via devicectl)
#                                 — "app-store-connect" (TestFlight / App Store)
#                                 — "release-testing" (Ad Hoc)
#                                 default: "debugging"
#   APPLE_ID                      — Apple ID for App Store Connect upload
#   APPLE_APP_SPECIFIC_PASSWORD   — app-specific password
#   UPLOAD_TO_APP_STORE           — "1" to xcrun altool upload after export
#
# Output:
#   build/ios/ShieldMail.ipa
#
# Usage:
#   APPLE_TEAM_ID=… ./scripts/build-ios.sh                          # dev (debugging)
#   APPLE_TEAM_ID=… EXPORT_METHOD=app-store-connect \
#     APPLE_ID=… APPLE_APP_SPECIFIC_PASSWORD=… UPLOAD_TO_APP_STORE=1 \
#     ./scripts/build-ios.sh                                        # App Store

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$ROOT/extension"
IOS_DIR="$ROOT/ios"
BUILD_DIR="$ROOT/build/ios"

EXPORT_METHOD="${EXPORT_METHOD:-debugging}"

cd "$ROOT"

echo "==> [1/4] Build extension dist (production)"
cd "$EXT_DIR"
if [ ! -d node_modules ]; then npm ci; fi
NODE_ENV=production npm run build

echo "==> [2/4] Generate Xcode project (xcodegen)"
cd "$IOS_DIR"
if ! command -v xcodegen >/dev/null 2>&1; then
  echo "error: xcodegen not installed. Run: brew install xcodegen"
  exit 1
fi
xcodegen generate

echo "==> [3/4] Archive iOS app (method: $EXPORT_METHOD)"
mkdir -p "$BUILD_DIR"
ARCHIVE="$BUILD_DIR/ShieldMail.xcarchive"
rm -rf "$ARCHIVE"

XCBUILD_ARGS=(
  -project ShieldMail.xcodeproj
  -scheme ShieldMail
  -configuration Release
  -destination "generic/platform=iOS"
  -archivePath "$ARCHIVE"
  archive
)

if [ -n "${APPLE_TEAM_ID:-}" ]; then
  XCBUILD_ARGS+=( DEVELOPMENT_TEAM="$APPLE_TEAM_ID" )
else
  echo "    (no APPLE_TEAM_ID — using auto signing or unsigned)"
fi

xcrun xcodebuild "${XCBUILD_ARGS[@]}"

echo "==> [4/4] Export .ipa"
EXPORT_DIR="$BUILD_DIR/export"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

EXPORT_PLIST="$BUILD_DIR/ExportOptions.plist"
cat > "$EXPORT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID:-}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>compileBitcode</key>
  <false/>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
EOF

xcrun xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

cp "$EXPORT_DIR/ShieldMail.ipa" "$BUILD_DIR/"

echo "✓ iOS build complete"
echo "  $BUILD_DIR/ShieldMail.ipa"

if [ "${UPLOAD_TO_APP_STORE:-}" = "1" ]; then
  echo "==> Uploading to App Store Connect..."
  if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
    echo "error: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD required for upload"
    exit 1
  fi
  xcrun altool --upload-app \
    --type ios \
    --file "$BUILD_DIR/ShieldMail.ipa" \
    --username "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD"
  echo "✓ uploaded to App Store Connect"
fi
