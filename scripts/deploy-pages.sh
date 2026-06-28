#!/usr/bin/env bash
# SPARK — one-command production deploy to GitHub Pages, WITHOUT GitHub Actions.
#
# WHY THIS EXISTS
#   The GitHub *account* is locked over a billing issue, which kills ALL GitHub
#   Actions runs — so the normal deploy.yml auto-deploy-on-push is dead. The
#   classic Pages builder runs on SEPARATE infra that is NOT affected by the
#   account lock; it only needs the repo to be PUBLIC to run free, and it
#   auto-rebuilds whenever the `gh-pages` branch is pushed. This script builds
#   the site locally and publishes dist/ to gh-pages, so a `git push` is no
#   longer required for the live site to update — just run this.
#
# USAGE
#   bash scripts/deploy-pages.sh         (or: npm run deploy)
#
# REQUIRES
#   gh (authenticated), node/npm, repo PUBLIC, Pages source = gh-pages branch.
#
# WHEN BILLING IS FIXED
#   Clear the lock (GitHub -> Settings -> Billing), then you can revert to the
#   automatic pipeline: set Pages source back to "GitHub Actions" and let
#   .github/workflows/deploy.yml deploy on push again.
#   See memory: spark-deploy-account-billing-lock.
set -euo pipefail

cd "$(dirname "$0")/.."
# NOTE: MSYS_NO_PATHCONV is applied per-`gh api` call (below), NOT globally —
# exporting it breaks Git Bash's /tmp path translation for the native git binary.
REPO="daneshto-dotcom/the-spark"
REMOTE="$(git remote get-url origin)"

echo "==> [1/4] Building (tsc + vite + bundle-size gate)…"
npm run build
touch dist/.nojekyll        # skip Jekyll processing on the classic Pages builder
test -f dist/index.html || { echo "FATAL: dist/index.html missing after build"; exit 1; }
test -f dist/CNAME      || { echo "FATAL: dist/CNAME missing — custom domain would break"; exit 1; }

echo "==> [2/4] Publishing dist/ to the gh-pages branch…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R dist/. "$TMP/"
git -C "$TMP" init -q
git -C "$TMP" checkout -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.email=daneshto@gmail.com -c user.name='Oleg Neshto' \
  commit -qm "deploy: $(git rev-parse --short HEAD) @ $(date -u +%FT%TZ)"
git -C "$TMP" push --force "$REMOTE" gh-pages:gh-pages

echo "==> [3/4] Triggering the classic Pages build…"
MSYS_NO_PATHCONV=1 gh api -X POST "repos/$REPO/pages/builds" --jq '.status' >/dev/null || true
for _ in $(seq 1 30); do
  S="$(MSYS_NO_PATHCONV=1 gh api "repos/$REPO/pages/builds/latest" --jq '.status' 2>/dev/null || true)"
  echo "    pages build: ${S:-<pending>}"
  [ "$S" = "built" ]   && break
  [ "$S" = "errored" ] && { echo "FATAL: Pages build errored"; exit 1; }
  sleep 6
done

echo "==> [4/4] Verifying the live site serves THIS build…"
WANT="$(grep -o 'assets/index-[A-Za-z0-9_]*\.js' dist/index.html | head -1)"
for _ in $(seq 1 12); do
  LIVE="$(curl -s --max-time 20 "https://spark-online.space/?cb=$(date +%s%N)" \
          | grep -o 'assets/index-[A-Za-z0-9_]*\.js' | head -1 || true)"
  echo "    live=${LIVE:-<none>}   want=$WANT"
  [ "$LIVE" = "$WANT" ] && { echo "✓ DEPLOYED — https://spark-online.space/ now serves this build."; exit 0; }
  sleep 8
done
echo "WARN: live asset hash didn't match within timeout (CDN cache may lag a minute). Re-check shortly."
