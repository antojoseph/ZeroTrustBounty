#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build_extension.sh
# Builds the BurpSuite extension JAR using Gradle.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=================================================="
echo " Building TLSNotary BurpSuite Extension"
echo "=================================================="
echo ""

cd "$ROOT_DIR"

# Use the Gradle wrapper if present; otherwise fall back to system Gradle
if [ -f "./gradlew" ]; then
    ./gradlew deployToRoot
elif command -v gradle &>/dev/null; then
    gradle deployToRoot
else
    echo "ERROR: Gradle not found. Install it from https://gradle.org/install/"
    exit 1
fi

echo ""
echo "Build complete!"
echo "Load  $ROOT_DIR/tlsnotary-burp-extension.jar  into BurpSuite:"
echo "  Extensions → Add → Extension type: Java → select the JAR"
