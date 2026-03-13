#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start_bridge.sh
# Starts the TLSNotary bridge service.
#
# Usage:
#   ./scripts/start_bridge.sh [options]
#
# Options are forwarded directly to tlsnotary_bridge.py:
#   --host HOST         Listen address       (default: 127.0.0.1)
#   --port PORT         Listen port          (default: 7777)
#   --prover-bin PATH   Path to simple_prover binary
#   --debug             Enable debug output
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BRIDGE_SCRIPT="$ROOT_DIR/bridge/tlsnotary_bridge.py"
TLSN_DIR="$ROOT_DIR/../tlsn"

# ── Auto-detect prover binary ─────────────────────────────────────────────────
PROVER_BIN="${TLSN_PROVER_BIN:-}"

if [ -z "$PROVER_BIN" ]; then
    RELEASE_BIN="$TLSN_DIR/target/release/examples/simple_prover"
    DEBUG_BIN="$TLSN_DIR/target/debug/examples/simple_prover"
    if [ -f "$RELEASE_BIN" ]; then
        PROVER_BIN="$RELEASE_BIN"
    elif [ -f "$DEBUG_BIN" ]; then
        PROVER_BIN="$DEBUG_BIN"
    fi
fi

# ── Build prover if not found ─────────────────────────────────────────────────
if [ -z "$PROVER_BIN" ] && [ -d "$TLSN_DIR" ]; then
    echo "Prover binary not found. Building..."
    (cd "$TLSN_DIR" && cargo build --release --example simple_prover 2>&1)
    PROVER_BIN="$TLSN_DIR/target/release/examples/simple_prover"
fi

echo "=================================================="
echo " TLSNotary Bridge Service"
echo "=================================================="
if [ -n "$PROVER_BIN" ] && [ -f "$PROVER_BIN" ]; then
    echo " Prover binary : $PROVER_BIN"
else
    echo " Prover binary : NOT FOUND (set TLSN_PROVER_BIN or build first)"
fi
echo "=================================================="
echo ""

EXTRA_ARGS=()
if [ -n "$PROVER_BIN" ] && [ -f "$PROVER_BIN" ]; then
    EXTRA_ARGS+=("--prover-bin" "$PROVER_BIN")
fi

python3 "$BRIDGE_SCRIPT" "${EXTRA_ARGS[@]}" "$@"
