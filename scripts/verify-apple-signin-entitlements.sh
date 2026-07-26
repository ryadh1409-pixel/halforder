#!/usr/bin/env bash
# Verifies that a built HalfOrder .app embeds Sign In with Apple entitlement.
# Usage:
#   ./scripts/verify-apple-signin-entitlements.sh [path/to/HalfOrder.app]
set -euo pipefail

APP="${1:-}"
if [[ -z "$APP" ]]; then
  CANDIDATES=(
    "ios/build/Build/Products/Debug-iphoneos/HalfOrder.app"
    "ios/build/Build/Products/Release-iphoneos/HalfOrder.app"
    "ios/build/Build/Products/Debug-iphonesimulator/HalfOrder.app"
  )
  for c in "${CANDIDATES[@]}"; do
    if [[ -d "$c" ]]; then APP="$c"; break; fi
  done
fi

if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "ERROR: HalfOrder.app not found. Pass a path or build first."
  exit 2
fi

echo "Inspecting: $APP"
echo "---- codesign identity ----"
codesign -dv --verbose=2 "$APP" 2>&1 | egrep 'Authority|TeamIdentifier|Signature|Identifier' || true
echo "---- entitlements ----"
ENTITLEMENTS="$(codesign -d --entitlements :- "$APP" 2>/dev/null || true)"
echo "$ENTITLEMENTS" | plutil -p - 2>/dev/null || echo "$ENTITLEMENTS"

if echo "$ENTITLEMENTS" | grep -q 'com.apple.developer.applesignin'; then
  echo "FACT: com.apple.developer.applesignin IS present in the signed binary."
  exit 0
fi

echo "FACT: signed binary does NOT contain com.apple.developer.applesignin."
echo "FACT: restricted entitlements require a team-signed build (Development/Distribution),"
echo "      not an ad-hoc simulator signature."
exit 1
