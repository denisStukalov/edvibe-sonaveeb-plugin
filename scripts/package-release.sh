#!/usr/bin/env bash
set -euo pipefail

VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -n1)"
if [[ -z "${VERSION}" ]]; then
  echo "Could not read version from manifest.json" >&2
  exit 1
fi

OUT_DIR="release"
OUT="${OUT_DIR}/edvibe-sonaveeb-link-v${VERSION}.zip"

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
