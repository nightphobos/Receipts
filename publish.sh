#!/usr/bin/env bash
# One-time: create the public GitHub repo, push, enable Pages + secret, publish the APK as a release.
# Needs: gh (brew install gh) logged in (gh auth login). Usage: ./publish.sh [repo-name]
set -euo pipefail
cd "$(dirname "$0")"
NAME="${1:-receipts}"
set -a; source .env; set +a

if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$NAME" --public --source . --remote origin --description "Receipts — on-chain price calls you can't clean up (Solana Seeker)"
fi
git push -u origin HEAD

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
# Pages from GitHub Actions (indexer workflow deploys site/)
gh api -X POST "repos/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true
[ -n "${EXPO_PUBLIC_PYTH_API_KEY:-}" ] && printf '%s' "$EXPO_PUBLIC_PYTH_API_KEY" | gh secret set PYTH_API_KEY
[ -n "${INDEXER_RPC_URL:-}" ] && printf '%s' "$INDEXER_RPC_URL" | gh secret set INDEXER_RPC_URL
gh workflow run indexer.yml >/dev/null 2>&1 || true

APK="$(ls -t dist/receipts-*.apk | head -1)"
TAG="v1.0.0-$(date +%Y%m%d%H%M)"
gh release create "$TAG" "$APK" --title "Receipts $TAG" --notes-file docs/RELEASE_NOTES.md
echo
echo "Repo:    https://github.com/$REPO"
echo "Release: https://github.com/$REPO/releases/tag/$TAG"
echo "Pages:   https://$(echo "$REPO" | cut -d/ -f1 | tr A-Z a-z).github.io/$(echo "$REPO" | cut -d/ -f2)/  (after the first indexer run)"
echo "Then put that Pages URL into .env as EXPO_PUBLIC_LEADERBOARD_URL and run ./ship.sh"
