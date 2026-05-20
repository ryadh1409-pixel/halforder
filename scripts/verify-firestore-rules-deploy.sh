#!/usr/bin/env bash
# Verify Firestore rules config and deploy to project halforfer.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Firebase project =="
grep -A2 '"default"' .firebaserc || true
echo ""
echo "== firebase.json firestore rules path =="
node -e "const j=require('./firebase.json'); console.log(j.firestore?.rules ?? 'MISSING')"
echo ""
echo "== App projectId (services/firebase.ts) =="
grep projectId services/firebase.ts | head -1
echo ""
echo "== Local rules SHA256 =="
shasum -a 256 firestore.rules
echo ""
echo "== Deploying rules to halforfer =="
npx -y firebase-tools@latest deploy --only firestore:rules --project halforfer
echo ""
echo "Done. Rules are published. Retry checkout in the app."
