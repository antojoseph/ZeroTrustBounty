# TLSNotary BurpSuite Extension

Generate cryptographic **TLSNotary proofs** of HTTP requests and responses
directly from BurpSuite's Repeater tab — with optional selective redaction of
sensitive request fields.

```
BurpSuite Repeater
  └─► Right-click → "Generate TLSNotary Proof"
        └─► TLSNotary Bridge (Python)
              └─► TLSNotary Prover (Rust) ←→ Notary Server
                    └─► proof.json  ✓
```

---

## What is TLSNotary?

[TLSNotary](https://tlsnotary.org) is an open-source protocol that lets a
*prover* convince a *verifier* that a specific HTTPS request/response exchange
actually happened — without the verifier needing to be present during the
session.  It uses multi-party computation (MPC) over the TLS handshake so the
notary server witnesses the session without learning the plaintext.

---

## Project Layout

```
burpsuite-tlsnotary-extension/
├── src/main/java/com/zerotrust/tlsnotary/
│   ├── TLSNotaryExtension.java   # BurpSuite entry-point (Montoya API)
│   ├── TLSNotaryConfig.java      # Persisted settings (host, port, paths …)
│   ├── TLSNotaryPanel.java       # Settings UI tab in BurpSuite
│   ├── TLSNotaryContextMenu.java # Right-click menu provider (Repeater / Proxy)
│   ├── RedactionRule.java        # Data class for redaction rules
│   ├── RedactionDialog.java      # Interactive redaction selection dialog
│   └── ProofGenerationTask.java  # Background worker → bridge client
├── bridge/
│   ├── tlsnotary_bridge.py       # Local HTTP bridge / job runner
│   └── requirements.txt          # Python deps (stdlib only by default)
├── scripts/
│   ├── build_extension.sh        # Gradle build → outputs JAR
│   ├── start_bridge.sh           # Starts the bridge (auto-finds prover)
│   └── setup_gradle_wrapper.sh   # One-time Gradle wrapper setup
├── build.gradle
└── settings.gradle
```

---

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| BurpSuite | Professional or Community ≥ 2023.x (Montoya API) |
| Java | JDK 17+ (for building); BurpSuite ships its own JRE |
| Python | 3.8+ (for the bridge service) |
| Rust / Cargo | For building the TLSNotary prover binary |
| TLSNotary notary server | Running instance (see below) |

---

## Quick Start

### 1. Build the TLSNotary prover

```bash
cd ../tlsn
cargo build --release --example simple_prover
# binary lands at: tlsn/target/release/examples/simple_prover
```

### 2. Start a Notary server

Use the minimal notary included in this repo:

```bash
cd ../tlsn
cargo run --example simple_notary
# Listening on 127.0.0.1:8080
```

Or use the full-featured [notary-server](https://github.com/tlsnotary/notary-server)
which adds TLS, WebSocket, and per-session configuration:

```bash
git clone https://github.com/tlsnotary/notary-server
cd notary-server
cargo run --release
# Listening on 127.0.0.1:7047 with TLS
```

### 3. Start the bridge service

```bash
./scripts/start_bridge.sh
# TLSNotary Bridge listening on http://127.0.0.1:7777
```

The script auto-discovers the prover binary.  Override with:

```bash
TLSN_PROVER_BIN=/path/to/simple_prover ./scripts/start_bridge.sh
```

### 4. Build and load the BurpSuite extension

```bash
./scripts/build_extension.sh
# Outputs: tlsnotary-burp-extension.jar
```

In BurpSuite:
1. Go to **Extensions → Installed → Add**
2. Extension type: **Java**
3. Select `tlsnotary-burp-extension.jar`
4. Click **Next** — the extension loads with no errors in the Output tab.

### 5. Configure the extension

Open the **TLSNotary** tab that appears in BurpSuite's top navigation:

| Field | Description | Default |
|-------|-------------|---------|
| Bridge URL | URL of the running bridge service | `http://127.0.0.1:7777` |
| Notary Host | Hostname of the TLSNotary notary server | `127.0.0.1` |
| Notary Port | Port of the notary server | `7047` |
| CA Certificate Path | Path to the notary server's CA cert (for TLS) | `./rootCA.crt` |
| Proof Output Directory | Where proof JSON files are saved | `~/tlsnotary-proofs` |
| Timeout | Max seconds to wait for proof generation | `120` |
| Hide request by default | Pre-select "hide request" for every proof | off |

Click **Save Settings**, then **Test Connection** to verify the bridge is reachable.

---

## Generating a Proof

### Standard proof

1. In **Repeater**, craft and send your request as normal.
2. **Right-click** anywhere in the request editor.
3. Choose **"Generate TLSNotary Proof"**.
4. A progress dialog appears while the MPC TLS session runs (30–120 s).
5. On success, a dialog shows the proof path and lets you copy it.

The proof JSON is also saved to your configured output directory.

### Proof with selective redaction

1. Right-click → **"Generate TLSNotary Proof (with Redactions)"**
2. A dialog lists every request header as a checkbox.
   - Tick headers you want to **hide** from verifiers (e.g. `Authorization`,
     `Cookie`, `X-API-Key`).
   - Tick **"Hide request body"** if the body is sensitive.
   - Enter arbitrary literal strings to redact under **Custom Substrings**.
3. Click **Generate Proof**.

### Hide entire request (response-only proof)

Right-click → **"Generate TLSNotary Proof (Hide Entire Request)"**

The proof will only reveal the **response** to verifiers.  The request is
committed but never opened — proving the server replied, without revealing what
was asked.

---

## How It Works

```
┌──────────────────────────────────────────────────────────────┐
│                     BurpSuite (Java)                         │
│  Repeater ──right-click──► ProofGenerationTask               │
│                               │                              │
│                      POST /generate-proof                     │
│                       { request_b64, redaction_rules, … }    │
└───────────────────────────────┼──────────────────────────────┘
                                │ HTTP/JSON
                                ▼
┌──────────────────────────────────────────────────────────────┐
│                  TLSNotary Bridge (Python)                    │
│  • Decodes request bytes                                      │
│  • Builds test.json for the prover                           │
│  • Spawns simple_prover binary                                │
│  • Polls for proof.json output                                │
│  • Returns proof JSON in GET /proof-status/{job_id}          │
└───────────────────────────────┬──────────────────────────────┘
                                │ subprocess
                                ▼
┌──────────────────────────────────────────────────────────────┐
│              simple_prover (Rust / TLSNotary)                 │
│  1. Connects to Notary server (TLS)                           │
│  2. Notary sets up MPC backend                                │
│  3. Prover opens MPC-TLS connection to target server          │
│  4. Sends HTTP request through MPC-TLS                        │
│  5. Receives response                                         │
│  6. Commits to selected byte ranges (public / private)        │
│  7. Finalises with Notary → gets signed session proof         │
│  8. Builds substrings proof (reveals public ranges only)      │
│  9. Writes proof.json                                         │
└──────────────────────────────────────────────────────────────┘
```

### Redaction mechanism

TLSNotary's commitment scheme lets the prover selectively commit to byte ranges
in the sent/received transcripts.  The bridge translates each `RedactionRule`
into a **private range** (committed but never opened).  Verifiers can confirm
the proof covers the full TLS session without ever seeing the redacted bytes.

---

## Bridge API Reference

The Python bridge exposes a small REST API (all responses are JSON):

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness check |
| `POST` | `/generate-proof` | Submit a new proof job |
| `GET`  | `/proof-status/{id}` | Poll job status / retrieve proof |
| `GET`  | `/jobs` | List all known jobs |

### POST /generate-proof – request body

```json
{
  "notary_host":      "127.0.0.1",
  "notary_port":      7047,
  "ca_cert_path":     "./rootCA.crt",
  "output_dir":       "/home/user/tlsnotary-proofs",
  "target_host":      "example.com",
  "target_port":      443,
  "use_tls":          true,
  "request_b64":      "<base64-encoded raw HTTP request>",
  "response_b64":     "<base64-encoded raw HTTP response or null>",
  "hide_request":     false,
  "timeout_seconds":  120,
  "redaction_rules": [
    { "type": "HEADER",    "value": "Authorization" },
    { "type": "HEADER",    "value": "Cookie" },
    { "type": "BODY" },
    { "type": "SUBSTRING", "value": "secret_token_here" },
    { "type": "FULL_REQUEST" }
  ]
}
```

### GET /proof-status/{id} – response

```json
{
  "job_id":     "550e8400-e29b-41d4-a716-446655440000",
  "status":     "completed",
  "proof_json": "{ … TlsProof … }",
  "proof_path": "/home/user/tlsnotary-proofs/proof_20240315_143022_550e8400.json",
  "error":      null,
  "log":        ["Connected to notary", "MPC TLS established", "…"]
}
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Cannot reach bridge" | Bridge not running | Run `./scripts/start_bridge.sh` |
| "Prover binary not found" | Binary not built | `cd ../tlsn && cargo build --release --example simple_prover` |
| Proof times out | Slow notary / network | Increase timeout in settings |
| "Prover exited with code 1" | Wrong notary host/port or CA cert | Check TLSNotary tab settings |
| No menu item in Repeater | Extension not loaded | Check Extensions → Output tab for errors |

---

## Security Notes

- The bridge listens on `127.0.0.1` only by default. **Do not** expose it on a
  network interface without authentication.
- Request bytes (including headers, cookies, tokens) are sent from BurpSuite to
  the bridge over localhost HTTP. This is acceptable on a developer workstation
  but consider TLS or Unix sockets for shared environments.
- Proof files contain the revealed transcript substrings. Store them accordingly.

---

## License

MIT — see the root `LICENSE` file.
