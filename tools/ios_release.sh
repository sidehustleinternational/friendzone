#!/usr/bin/env bash
set -euo pipefail

# === Homer iOS Release Script ===
# Takes you from "working in Expo Go" to "uploaded to App Store Connect/TestFlight"
# Usage: ./tools/ios_release.sh [profile]
# Created: September 28, 2025

# === CONFIG (edit if desired) ===
PROJECT_DIR="$(pwd)"                    # Must be root of your Expo project
PLATFORM="ios"                          # ios only
PROFILE="${1:-production}"              # eas.json profile (default: production)
BUMP_VERSION="${BUMP_VERSION:-false}"   # set true to bump app store version
BUMP_BUILD="${BUMP_BUILD:-true}"        # set false to keep same buildNumber
APP_JSON="app.json"
EAS_JSON="eas.json"

echo "== Homer iOS Release =="
echo "Project: $PROJECT_DIR"
echo "Profile: $PROFILE"
echo

# --- Sanity checks ---
if [ ! -f "$APP_JSON" ]; then
  echo "Error: $APP_JSON not found. Run this script from the Expo project root (contains app.json)."
  exit 1
fi

# Ensure eas-cli is available
if ! command -v npx >/dev/null 2>&1; then
  echo "Error: Node/npm not found. Install Node.js first."
  exit 1
fi

if ! npx eas --version >/dev/null 2>&1; then
  echo "Installing EAS CLI locally..."
  npm install --save-dev eas-cli
fi

# --- Show current version/build ---
CURRENT_VERSION=$(node -e "console.log(require('./$APP_JSON').expo.version || '')" || true)
CURRENT_BUILD=$(node -e "console.log((require('./$APP_JSON').expo.ios||{}).buildNumber || '')" || true)
echo "Current version: ${CURRENT_VERSION:-<unset>}"
echo "Current iOS buildNumber: ${CURRENT_BUILD:-<unset>}"
echo

# --- Optional: bump version and/or build number ---
# Requires 'jq' (attempt to install via Homebrew if missing)
ensure_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    if command -v brew >/dev/null 2>&1; then
      echo "Installing jq via Homebrew..."
      brew install jq
    else
      echo "Error: jq is required to bump versions. Install jq or set BUMP_VERSION=false BUMP_BUILD=false."
      exit 1
    fi
  fi
}

if [ "$BUMP_VERSION" = "true" ] || [ "$BUMP_BUILD" = "true" ]; then
  ensure_jq
  TMP_APP_JSON="$(mktemp).json"

  if [ "$BUMP_VERSION" = "true" ]; then
    # Bump semver patch: 1.2.3 -> 1.2.4 (safe default)
    NEW_VERSION=$(node -e "const v=require('./$APP_JSON').expo.version||'1.0.0'; const [a=1,b=0,c=0]=v.split('.').map(Number); console.log([a,b,(c||0)+1].join('.'))")
    echo "Bumping version: $CURRENT_VERSION -> $NEW_VERSION"
    jq --arg v "$NEW_VERSION" '.expo.version = $v' "$APP_JSON" > "$TMP_APP_JSON" && mv "$TMP_APP_JSON" "$APP_JSON"
  fi

  if [ "$BUMP_BUILD" = "true" ]; then
    NEW_BUILD=$(node -e "const b=((require('./$APP_JSON').expo.ios||{}).buildNumber)||'0'; console.log(String(Number(b||0)+1))")
    echo "Bumping iOS buildNumber: $CURRENT_BUILD -> $NEW_BUILD"
    jq --arg b "$NEW_BUILD" '
      .expo.ios = (.expo.ios // {}) |
      .expo.ios.buildNumber = $b
    ' "$APP_JSON" > "$TMP_APP_JSON" && mv "$TMP_APP_JSON" "$APP_JSON"
  fi

  echo "Updated $APP_JSON:"
  cat "$APP_JSON"
  echo
fi

# --- Configure EAS if needed ---
if [ ! -f "$EAS_JSON" ]; then
  echo "Configuring EAS for iOS..."
  npx eas build:configure --platform ios --non-interactive || npx eas build:configure --platform ios
  echo
fi

# --- Show credentials status (optional but helpful) ---
echo "Checking credentials..."
npx eas credentials --platform ios || true
echo

# --- Start the build ---
echo "Starting EAS build for iOS (profile: $PROFILE)..."
BUILD_JSON=$(mktemp).json
# Use --non-interactive, but fall back to interactive if something needs your input
set +e
npx eas build --platform ios --profile "$PROFILE" --non-interactive --json > "$BUILD_JSON"
STATUS=$?
set -e

if [ $STATUS -ne 0 ]; then
  echo "Non-interactive build required input. Starting interactive build..."
  npx eas build --platform ios --profile "$PROFILE" --json > "$BUILD_JSON"
fi

# --- Extract build id and url ---
BUILD_ID=$(node -e "const d=require('$BUILD_JSON'); console.log(d?.builds?.ios?.buildId || d?.id || '')" || true)
CONSOLE_URL=$(node -e "const d=require('$BUILD_JSON'); console.log(d?.builds?.ios?.buildDetailsPageUrl || d?.buildDetailsPageUrl || '')" || true)

if [ -z "$BUILD_ID" ]; then
  echo "Build started; open Expo build page for details:"
  cat "$BUILD_JSON"
else
  echo "Build started: $BUILD_ID"
  echo "View logs: ${CONSOLE_URL:-open your Expo dashboard}"
fi
echo

# --- Wait for build to finish ---
echo "Waiting for build to complete (you can Ctrl+C and watch in the dashboard)..."
npx eas build:watch --build $BUILD_ID || true
echo

# --- Submit to App Store Connect (TestFlight) ---
echo "Submitting to App Store Connect (TestFlight)..."
# Prefer submitting by build id (avoids interactive prompts)
set +e
npx eas submit --platform ios --id "$BUILD_ID" --non-interactive
SUBMIT_STATUS=$?
set -e

if [ $SUBMIT_STATUS -ne 0 ]; then
  echo "Non-interactive submit needed input. Falling back to interactive selection..."
  npx eas submit --platform ios --id "$BUILD_ID"
fi

echo
echo "✅ Done! Your build is on its way to TestFlight."
echo "📱 Check App Store Connect → TestFlight for processing status."
echo "🚀 Once processed, you can distribute to testers or submit for App Store review."
