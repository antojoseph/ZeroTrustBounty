#!/usr/bin/env python3
"""
TLSNotary Bridge Service
========================
A lightweight HTTP server that sits between the BurpSuite extension and the
Rust TLSNotary prover binary.

The BurpSuite extension POSTs a JSON job describing which request to notarise.
The bridge spawns the Rust prover as a subprocess, monitors it, and returns the
resulting proof JSON to the extension.

Architecture
------------
BurpSuite (Repeater)
  └─► BurpExtension (Java)
        └─► [HTTP POST /generate-proof]
              └─► TLSNotaryBridge (this script)
                    ├─► Writes request JSON to a temp file
                    ├─► Spawns `tlsn_prover` binary (Rust)
                    │     ├─► Connects to Notary server
                    │     ├─► MPC TLS to target server
                    │     └─► Outputs proof.json
                    └─► Returns proof JSON to extension

Requirements
------------
    pip install flask

Usage
-----
    python tlsnotary_bridge.py [--host 127.0.0.1] [--port 7777] \
                               [--prover-bin /path/to/simple_prover]

"""

import argparse
import base64
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Dict, Optional, List, Any
from urllib.parse import urlparse

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("tlsnotary-bridge")

# ── Global job store (in-memory; single-process) ──────────────────────────────

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

# ── Configuration (set via CLI args) ─────────────────────────────────────────

PROVER_BIN: str = ""          # path to `simple_prover` binary
BRIDGE_HOST: str = "127.0.0.1"
BRIDGE_PORT: int = 7777


# ─────────────────────────────────────────────────────────────────────────────
# Job lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def create_job(job_id: str) -> Dict[str, Any]:
    job = {
        "job_id": job_id,
        "status": "pending",  # pending → running → completed | failed
        "created_at": datetime.utcnow().isoformat(),
        "proof_json": None,
        "proof_path": None,
        "error": None,
        "log": [],
    }
    with _jobs_lock:
        _jobs[job_id] = job
    return job


def update_job(job_id: str, **kwargs):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id].update(kwargs)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        return dict(_jobs.get(job_id, {}))


# ─────────────────────────────────────────────────────────────────────────────
# Proof generation worker
# ─────────────────────────────────────────────────────────────────────────────

def run_proof_generation(job_id: str, payload: Dict[str, Any]):
    """Runs in a background thread; drives the Rust prover and updates job state."""
    update_job(job_id, status="running")
    log.info("[%s] Starting proof generation for %s:%s",
             job_id, payload.get("target_host"), payload.get("target_port"))

    workdir = tempfile.mkdtemp(prefix="tlsnotary_")
    try:
        _do_generate(job_id, payload, workdir)
    except Exception as exc:
        log.error("[%s] Proof generation error: %s", job_id, exc, exc_info=True)
        update_job(job_id, status="failed", error=str(exc))
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:
            pass


def _do_generate(job_id: str, payload: Dict[str, Any], workdir: str):
    """Internal: orchestrates file preparation and prover invocation."""

    notary_host     = payload["notary_host"]
    notary_port     = int(payload["notary_port"])
    ca_cert_path    = payload.get("ca_cert_path", "./rootCA.crt")
    output_dir      = payload.get("output_dir", str(Path.home() / "tlsnotary-proofs"))
    target_host     = payload["target_host"]
    target_port     = int(payload.get("target_port", 443))
    use_tls         = bool(payload.get("use_tls", True))
    hide_request    = bool(payload.get("hide_request", False))
    timeout_seconds = int(payload.get("timeout_seconds", 120))
    redaction_rules: List[Dict] = payload.get("redaction_rules", [])

    # Decode raw request bytes
    request_b64  = payload.get("request_b64", "")
    request_bytes = base64.b64decode(request_b64) if request_b64 else b""

    # Parse request into components the prover needs
    req_info = parse_http_request(request_bytes)

    # Determine URI (path + query)
    uri = req_info.get("path", "/")

    # Build the test.json file that the simple_prover reads
    prover_input = build_prover_input(
        req_info, target_host, uri, hide_request, redaction_rules
    )

    input_file = os.path.join(workdir, "test.json")
    with open(input_file, "w") as f:
        json.dump(prover_input, f, indent=2)
    log.info("[%s] Wrote prover input to %s", job_id, input_file)

    # Copy CA cert into workdir so relative paths work
    ca_src = Path(ca_cert_path)
    if ca_src.exists():
        shutil.copy(ca_src, os.path.join(workdir, "rootCA.crt"))
    else:
        log.warning("[%s] CA cert not found at %s; prover will use system roots.", job_id, ca_cert_path)

    # Determine prover binary
    prover_bin = resolve_prover_bin()

    # Build CLI args based on redaction options
    cli_args = build_prover_args(prover_bin, hide_request, redaction_rules,
                                 notary_host, notary_port)

    log.info("[%s] Running prover: %s", job_id, " ".join(cli_args))
    update_job(job_id, **{"log": [f"Spawning prover: {' '.join(cli_args)}"]})

    env = os.environ.copy()
    env["RUST_LOG"] = "debug"
    # Pass notary connection details via env so the prover can pick them up
    # (patched version of simple_prover reads these as well as CLI flags)
    env["TLSN_NOTARY_HOST"] = notary_host
    env["TLSN_NOTARY_PORT"] = str(notary_port)

    proc = subprocess.Popen(
        cli_args,
        cwd=workdir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )

    stdout_lines = []
    deadline = time.time() + timeout_seconds

    for line in proc.stdout:
        line = line.rstrip()
        stdout_lines.append(line)
        log.debug("[%s] prover: %s", job_id, line)
        with _jobs_lock:
            _jobs[job_id].setdefault("log", []).append(line)

        if time.time() > deadline:
            proc.kill()
            raise TimeoutError(f"Prover timed out after {timeout_seconds}s")

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(
            f"Prover exited with code {proc.returncode}.\n"
            + "\n".join(stdout_lines[-30:])
        )

    # Locate the output proof.json (prover writes it to cwd)
    proof_src = os.path.join(workdir, "proof.json")
    if not os.path.exists(proof_src):
        raise FileNotFoundError(
            "Prover did not produce proof.json; check prover output:\n"
            + "\n".join(stdout_lines[-20:])
        )

    with open(proof_src, "r") as f:
        proof_json_str = f.read()

    # Persist proof to configured output directory
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    proof_dest = os.path.join(output_dir, f"proof_{ts}_{job_id[:8]}.json")
    shutil.copy(proof_src, proof_dest)
    log.info("[%s] Proof saved to %s", job_id, proof_dest)

    update_job(
        job_id,
        status="completed",
        proof_json=proof_json_str,
        proof_path=proof_dest,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Request parsing helpers
# ─────────────────────────────────────────────────────────────────────────────

def parse_http_request(raw: bytes) -> Dict[str, Any]:
    """
    Splits raw HTTP/1.1 request bytes into method, path, headers dict,
    and body string.  Handles both CRLF and LF line endings.
    """
    if not raw:
        return {"method": "GET", "path": "/", "headers": {}, "body": ""}

    raw_str = raw.decode("utf-8", errors="replace")
    # Normalise line endings
    raw_str = raw_str.replace("\r\n", "\n")
    header_part, _, body = raw_str.partition("\n\n")
    lines = header_part.split("\n")

    # Request line
    request_line = lines[0] if lines else "GET / HTTP/1.1"
    parts = request_line.split(" ", 2)
    method = parts[0] if len(parts) > 0 else "GET"
    path   = parts[1] if len(parts) > 1 else "/"

    # Headers
    headers: Dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            name, _, value = line.partition(":")
            headers[name.strip().lower()] = value.strip()

    return {
        "method": method,
        "path": path,
        "headers": headers,
        "body": body,
    }


def build_prover_input(
    req_info: Dict[str, Any],
    target_host: str,
    uri: str,
    hide_request: bool,
    redaction_rules: List[Dict],
) -> Dict[str, Any]:
    """
    Constructs the JSON object that the Rust simple_prover reads from test.json.

    The prover input mirrors the UserReq struct in simple_prover.rs:
        uri, host, accept, useragent, body
    """
    headers = req_info.get("headers", {})

    # Build list of headers/values to redact (private_seq passed to find_ranges)
    redact_strings: List[str] = []

    if hide_request:
        # Redact everything – send empty private_seq markers so prover hides all
        redact_strings = ["__HIDE_ALL_SENT__"]
    else:
        for rule in redaction_rules:
            rule_type = rule.get("type", "")
            rule_val  = rule.get("value", "")

            if rule_type == "HEADER" and rule_val:
                # Redact the header line "Name: Value\r\n"
                hdr_name_lower = rule_val.lower()
                if hdr_name_lower in headers:
                    # Reconstruct header line as it appears on the wire
                    redact_strings.append(f"{rule_val}: {headers[hdr_name_lower]}")

            elif rule_type == "BODY":
                body = req_info.get("body", "")
                if body:
                    redact_strings.append(body)

            elif rule_type == "SUBSTRING" and rule_val:
                redact_strings.append(rule_val)

            elif rule_type == "FULL_REQUEST":
                redact_strings = ["__HIDE_ALL_SENT__"]
                break

    prover_input = {
        "uri":       uri,
        "host":      target_host,
        "accept":    headers.get("accept", "*/*"),
        "useragent": headers.get("user-agent", "BurpSuite-TLSNotary/1.0"),
        "body":      req_info.get("body", ""),
        # Extra fields used by the patched prover / bridge CLI:
        "method":    req_info.get("method", "GET"),
        "redact":    redact_strings,
        "hide_request": hide_request,
    }

    return prover_input


# ─────────────────────────────────────────────────────────────────────────────
# Prover binary resolution
# ─────────────────────────────────────────────────────────────────────────────

def resolve_prover_bin() -> str:
    """
    Finds the Rust simple_prover binary using (in order):
      1. TLSN_PROVER_BIN environment variable
      2. --prover-bin CLI argument (global PROVER_BIN)
      3. ../tlsn/target/release/examples/simple_prover  (relative to this script)
      4. ../tlsn/target/debug/examples/simple_prover
      5. simple_prover on PATH
    """
    candidates = [
        os.environ.get("TLSN_PROVER_BIN", ""),
        PROVER_BIN,
        str(Path(__file__).parent.parent / "tlsn" / "target" / "release" / "examples" / "simple_prover"),
        str(Path(__file__).parent.parent / "tlsn" / "target" / "debug"   / "examples" / "simple_prover"),
        shutil.which("simple_prover") or "",
        shutil.which("tlsn_prover")   or "",
    ]
    for c in candidates:
        if c and Path(c).is_file():
            return c

    raise FileNotFoundError(
        "Cannot find the TLSNotary prover binary.\n"
        "Build it with:  cd ../tlsn && cargo build --release --example simple_prover\n"
        "Or set the TLSN_PROVER_BIN environment variable."
    )


def build_prover_args(
    prover_bin: str,
    hide_request: bool,
    redaction_rules: List[Dict],
    notary_host: str,
    notary_port: int,
) -> List[str]:
    """Maps redaction configuration to the simple_prover CLI flags."""
    args = [prover_bin]

    if hide_request or any(r.get("type") == "FULL_REQUEST" for r in redaction_rules):
        # --option2: only commits body (effectively hides headers)
        args.append("--option2")
    elif redaction_rules:
        # --option3: commits body + custom fields (all sensitive values hidden)
        args.append("--option3")
    else:
        # --option1: reveal URI, host, accept, useragent (standard proof)
        args.append("--option1")

    return args


# ─────────────────────────────────────────────────────────────────────────────
# HTTP server
# ─────────────────────────────────────────────────────────────────────────────

class BridgeHandler(BaseHTTPRequestHandler):
    """Simple HTTP/1.1 request handler – no external web framework required."""

    def log_message(self, fmt, *args):  # suppress default access log
        log.debug("HTTP %s", fmt % args)

    # ── Routing ───────────────────────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            self._json_response(200, {"status": "ok", "version": "1.0.0"})

        elif path.startswith("/proof-status/"):
            job_id = path.split("/proof-status/", 1)[1].strip("/")
            job = get_job(job_id)
            if not job:
                self._json_response(404, {"error": "Job not found"})
            else:
                self._json_response(200, {
                    "job_id":     job["job_id"],
                    "status":     job["status"],
                    "proof_json": job.get("proof_json"),
                    "proof_path": job.get("proof_path"),
                    "error":      job.get("error"),
                    "log":        job.get("log", [])[-50:],  # last 50 lines
                })

        elif path == "/jobs":
            with _jobs_lock:
                summary = [
                    {"job_id": j["job_id"], "status": j["status"],
                     "created_at": j["created_at"]}
                    for j in _jobs.values()
                ]
            self._json_response(200, {"jobs": summary})

        else:
            self._json_response(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/generate-proof":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode("utf-8"))
            except json.JSONDecodeError as exc:
                self._json_response(400, {"error": f"Invalid JSON: {exc}"})
                return

            # Validate required fields
            for field in ("notary_host", "notary_port", "target_host"):
                if field not in payload:
                    self._json_response(400, {"error": f"Missing field: {field}"})
                    return

            job_id = str(uuid.uuid4())
            create_job(job_id)
            log.info("Created job %s for %s", job_id, payload.get("target_host"))

            # Dispatch to background thread
            t = threading.Thread(
                target=run_proof_generation,
                args=(job_id, payload),
                daemon=True,
                name=f"ProofGen-{job_id[:8]}",
            )
            t.start()

            self._json_response(202, {"job_id": job_id, "status": "pending"})

        else:
            self._json_response(404, {"error": "Not found"})

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _json_response(self, status: int, data: dict):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "127.0.0.1")
        self.end_headers()
        self.wfile.write(body)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    global PROVER_BIN, BRIDGE_HOST, BRIDGE_PORT

    parser = argparse.ArgumentParser(
        description="TLSNotary Bridge – connects BurpSuite extension to TLSNotary prover"
    )
    parser.add_argument("--host", default="127.0.0.1",
                        help="Address to listen on (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=7777,
                        help="Port to listen on (default: 7777)")
    parser.add_argument("--prover-bin", default="",
                        help="Path to the simple_prover binary")
    parser.add_argument("--debug", action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    BRIDGE_HOST = args.host
    BRIDGE_PORT = args.port
    PROVER_BIN  = args.prover_bin

    # Warn early if prover binary cannot be located
    try:
        found = resolve_prover_bin()
        log.info("Prover binary: %s", found)
    except FileNotFoundError as exc:
        log.warning("%s", exc)

    server = HTTPServer((BRIDGE_HOST, BRIDGE_PORT), BridgeHandler)
    log.info("TLSNotary Bridge listening on http://%s:%d", BRIDGE_HOST, BRIDGE_PORT)
    log.info("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down.")
        server.shutdown()


if __name__ == "__main__":
    main()
