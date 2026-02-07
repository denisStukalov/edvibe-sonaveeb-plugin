#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="release"
OUT="${OUT_DIR}/edvibe-sonaveeb-link.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  src \
  assets \
  README.md \
  PRIVACY_POLICY.md \
  STORE_SUBMISSION.md

echo "Created $OUT"
