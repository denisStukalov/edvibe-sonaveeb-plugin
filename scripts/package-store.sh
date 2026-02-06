#!/usr/bin/env bash
set -euo pipefail

OUT="edvibe-sonaveeb-link.zip"

rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  src \
  assets \
  README.md \
  PRIVACY_POLICY.md \
  STORE_SUBMISSION.md

echo "Created $OUT"
