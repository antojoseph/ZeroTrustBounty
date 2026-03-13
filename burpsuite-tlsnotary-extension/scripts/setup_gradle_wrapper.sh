#!/usr/bin/env bash
# Downloads the Gradle wrapper so the project can be built without a system Gradle install.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

if command -v gradle &>/dev/null; then
    gradle wrapper --gradle-version 8.5
    echo "Gradle wrapper created."
else
    echo "Gradle not found. Download it from https://gradle.org/install/ then re-run this script."
    exit 1
fi
