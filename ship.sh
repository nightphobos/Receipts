#!/usr/bin/env bash
# Build release APK with current .env, install on the connected phone, launch it.
# Usage: ./ship.sh
set -euo pipefail
cd "$(dirname "$0")"
source .ralph-env >/dev/null
set -a; source .env; set +a

echo "== 1. Pyth key check"
if [ -n "${EXPO_PUBLIC_PYTH_API_KEY:-}" ]; then
  code=$(curl -s -o /tmp/rcpt-pyth.json -w '%{http_code}' -H "Authorization: Bearer $EXPO_PUBLIC_PYTH_API_KEY" \
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d&ids[]=38846ec4d0dbe808091817f5c0d6ab8058e25422348ddf97db52b6c378a93bf9&parsed=true")
  echo "  Hermes HTTP $code"
  [ "$code" = 200 ] && python3 -c "import json;d=json.load(open('/tmp/rcpt-pyth.json'));[print('  ',p['id'][:8],int(p['price']['price'])*10**p['price']['expo']) for p in d['parsed']]" \
    || echo "  !! key rejected — app will fail to fetch prices (fix key or set EXPO_PUBLIC_PRICE_SOURCE=mock)"
else
  echo "  no key — DEMO PRICES build"
fi

echo "== 2. Phone"
adb devices | sed 1d | grep 'device$' || { echo "  !! no phone in adb devices"; exit 1; }

echo "== 3. Release build (env inlined at bundle time)"
(cd android && ./gradlew assembleRelease -q)
mkdir -p dist
APK="dist/receipts-$(date +%Y%m%d-%H%M).apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
echo "  $APK"

echo "== 4. Install + launch"
if ! adb install -r "$APK"; then
  echo "  install failed (signature mismatch?) — uninstalling old build and retrying"
  adb uninstall com.clockin.receipts || true
  adb install "$APK"
fi
adb shell monkey -p com.clockin.receipts -c android.intent.category.LAUNCHER 1 >/dev/null
echo "Done. Receipts is open on the phone."
