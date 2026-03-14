# ZeroTrustBounty

ZeroTrustBounty is a local-first demo stack for submitting, verifying, and paying bug bounty reports backed by TLSNotary proofs.

The current implementation is built around three active pieces:

- `tlsn-docker/`: a Dockerized TLSNotary notary server and HTTP API
- `burpsuite-tlsnotary-extension/`: a Burp Suite extension that generates TLSNotary proofs from HTTPS traffic
- `bug-bounty-platform/`: a Next.js webapp that accepts uploaded TLSNotary presentations, verifies them through the Docker API, supports a gated redaction/reveal workflow, and records dummy payouts

The old Lit-based prototype is no longer part of the active product flow and has been removed from this repo.

## What Works Today

The end-to-end flow implemented in this repository is:

1. A researcher selects an HTTPS request in Burp Repeater or Proxy.
2. The Burp extension sends that request to the local `tlsn-api` service.
3. `tlsn-api` talks to the local notary server, generates proof artifacts, and returns them to the extension.
4. The extension writes the proof artifacts to disk:
   - `*.presentation.tlsn`
   - `*.full.presentation.tlsn` when the request was redacted
   - `*.attestation.tlsn`
   - `*.secrets.tlsn`
5. The researcher uploads the redacted or full `*.presentation.tlsn` file to the webapp.
6. The webapp verifies that presentation by calling the same `tlsn-api /verify` endpoint.
7. If the original proof hides request components, the company reviews the verified TLSNotary response, confirms a bounty amount, and unlocks the reveal step.
8. The researcher uploads the matching `*.full.presentation.tlsn` companion proof.
9. The webapp verifies that the full proof comes from the same notarized TLS session by matching the attestation fingerprint, server name, and session time.
10. The company can record a dummy payout directly from the report view or company dashboard.

There is no blockchain payment rail in the current code. Payouts are stored in SQLite as dummy `Payment` rows, company balances are decremented in the database, and the researcher reputation score is increased.

## Repository Layout

- `bug-bounty-platform/`
  Next.js 16 + React 19 + Prisma + SQLite application.
- `burpsuite-tlsnotary-extension/`
  Burp Suite extension built with the Montoya API and Gradle.
- `tlsn-docker/`
  Rust wrapper binaries plus Docker Compose for the notary and HTTP API.
- `tlsn/`
  Vendored TLSNotary workspace and legacy examples. This is useful as reference code, but it is not the runtime integration path used by the webapp or Burp extension.
- `components/`
  Supporting Rust crates used by the vendored TLSNotary workspace.

## Active Architecture

### 1. TLSNotary services

The live integration path is `tlsn-docker/`.

It builds one local image that provides four binaries:

- `tlsn-notary-server`
- `tlsn-prove`
- `tlsn-verify`
- `tlsn-api`

`docker-compose.yml` starts:

- `notary`
  Internal address `notary:7047`
  Host port `${TLSN_NOTARY_PORT:-7048}`
- `api`
  Internal bind `0.0.0.0:8090`
  Host port `${TLSN_API_PORT:-8090}`

The host intentionally defaults to `8090` instead of `8080`.

The Docker wrapper pins the upstream `tlsn` crate to tag `v0.1.0-alpha.14`.

### 2. Burp proof generation

The Burp extension no longer uses the old Python bridge. It talks directly to `tlsn-api`.

The context menu exposes three generation paths:

- `Generate TLSNotary Proof`
- `Generate TLSNotary Proof (with Redactions)`
- `Generate TLSNotary Proof (Hide Entire Request)`

For each request, the extension:

1. Rejects plain HTTP traffic. Only HTTPS requests can be proven.
2. Sends a JSON payload to `POST /prove`.
3. Receives base64-encoded artifacts from the API.
4. Writes them to the configured output directory.
5. Shows a success dialog with the saved paths and actions like opening the proof folder.

When the request is partially or fully hidden, the API also returns a companion full presentation from the same notarized session. That file is what the webapp later expects during the reveal step.

### 3. Webapp proof verification

The webapp accepts `.presentation.tlsn` uploads and verifies every uploaded presentation server-side before storing it.

The main routes are:

- `POST /api/reports/[id]/verify-proof`
  Verifies the initially uploaded presentation through `tlsn-api /verify`
- `PUT /api/reports/[id]/proof-reveal`
  Verifies the companion full presentation and matches it to the redacted one
- `POST /api/reports/[id]/proof-reveal`
  Company-side unlock action that confirms a bounty amount and allows the reporter to reveal the full request
- `POST /api/reports/[id]/pay`
  Records a dummy payout

The webapp stores the uploaded proof bytes in SQLite as base64 fields on the `Report` model together with verified metadata such as:

- `tlsProofServerName`
- `tlsProofTime`
- `tlsProofSentData`
- `tlsProofRecvData`
- `tlsProofFingerprint`
- `tlsProofRevealState`
- `tlsProofFull`
- `tlsProofFullFingerprint`

The platform does not trust filenames or pasted request text. The reveal workflow trusts the verified proof metadata itself.

### 4. Redacted request reveal workflow

If the initial presentation hides request bytes, the current flow is:

1. Researcher uploads the redacted `*.presentation.tlsn`.
2. The webapp verifies it and marks the report as `awaiting_company_confirmation`.
3. The company reviews the verified TLSNotary response and confirms a bounty amount.
4. The report moves to `ready_for_reporter_reveal`.
5. The researcher uploads the matching `*.full.presentation.tlsn`.
6. The webapp verifies that:
   - the full presentation is valid
   - it is not still redacted
   - it has the same attestation fingerprint as the redacted proof
   - it has the same verified server name
   - it has the same verified session time
7. The report moves to `revealed`.

This is an intentional proof-to-proof match. The platform no longer tries to compare pasted plaintext request bodies byte-for-byte.

### 5. Dummy payouts

Every company report row now exposes a payout button, and the report detail page exposes the same action.

The payout route:

- uses the report bounty amount if one is already set
- otherwise falls back to a dummy default payout of `$500`
- decrements the company `availableFunds`
- creates or updates a `Payment` row with `status = "paid"`
- increments the program `totalPaid`
- increments researcher reputation by `floor(amount / 100)`

All seeded companies start with `$100,000` in dummy funds.

## Prerequisites

You need the following installed locally:

- Docker Desktop or another Docker runtime
- Node.js and npm
- JDK 17+
- Gradle, or a Gradle wrapper if you add one later
- Burp Suite Community or Professional if you want to use the extension

## Quick Start

### 1. Start the TLSNotary services

From the repo root:

```bash
cd tlsn-docker
docker compose build
docker compose up -d notary api
curl -sS http://127.0.0.1:8090/health
```

Expected behavior:

- the notary listens on host port `7048`
- the API listens on host port `8090`
- `/health` returns `{"status":"ok",...}`

If you need different host ports:

```bash
TLSN_NOTARY_PORT=7050 TLSN_API_PORT=8091 docker compose up -d notary api
```

If you do that, point both the Burp extension and the webapp at the new API URL.

### 2. Start the webapp

```bash
cd bug-bounty-platform
npm install
npm run db:setup
npm run dev
```

Important behavior built into the scripts:

- `npm run dev` runs `prisma generate` and `prisma migrate deploy` before Next starts
- `npm run start` does the same
- the default SQLite database is `bug-bounty-platform/dev.db`
- if `DATABASE_URL` is not set, the app falls back to that local file automatically

Open the app at the port Next assigns locally.

### 3. Build the Burp extension

```bash
cd burpsuite-tlsnotary-extension
./scripts/build_extension.sh
```

This produces:

- `burpsuite-tlsnotary-extension/tlsnotary-burp-extension.jar`

Load that JAR into Burp:

1. Go to `Extensions`
2. Click `Add`
3. Choose type `Java`
4. Select `tlsnotary-burp-extension.jar`

### 4. Configure the Burp extension

In the `TLSNotary` Burp tab, set:

- `API URL`
  Usually `http://127.0.0.1:8090`
- `Proof Output Directory`
  Defaults to `~/tlsnotary-proofs`
- `Timeout`
  Default `120` seconds
- `Hide request by default`
  Optional convenience default

Leave `Use custom notary / CA overrides` disabled for the normal Docker setup. Those overrides are resolved from inside the API container, not from your Burp host.

## Seeded Accounts and Dummy Data

`npm run db:setup` seeds the application with demo users and programs.

All seeded users use password `password123`.

Researchers:

- `alice@researcher.com`
- `bob@hacker.io`
- `carol@security.dev`

Companies:

- `security@acmecorp.com`
- `bugs@techgiant.io`
- `security@cryptovault.fi`

Seed details:

- every seeded company gets `$100,000` in `availableFunds`
- the default fallback payout amount is `$500`
- seed data also creates demo programs and reports

## TLSNotary Artifact Model

The Docker API and Burp extension produce modern binary TLSNotary artifacts, not the old JSON proof format from the vendored legacy examples.

### Artifact types

- `*.presentation.tlsn`
  The verifier-facing proof presentation
- `*.full.presentation.tlsn`
  Optional companion proof used when the initial presentation hid request bytes
- `*.attestation.tlsn`
  Notary attestation bytes
- `*.secrets.tlsn`
  Prover-side secrets used to derive presentations

### Filename rules

Artifact stems are derived from the verified server name with non-alphanumeric characters replaced by `_`.

Examples:

- `example_com.presentation.tlsn`
- `example_com.full.presentation.tlsn`
- `www_google_com.attestation.tlsn`

### Where files live

- `tlsn-docker/artifacts/`
  Artifacts persisted by the Docker API when `persist: true`
- `~/tlsnotary-proofs`
  Default Burp output directory on macOS/Linux
- SQLite database fields in `bug-bounty-platform/dev.db`
  The webapp stores uploaded presentation bytes as base64 after verification

## End-to-End Flows

### Flow A: Generate a proof in Burp and upload it

1. Start the Docker services.
2. Load the Burp extension.
3. Send an HTTPS request to Repeater.
4. Right-click and choose one of the TLSNotary proof actions.
5. Wait for proof generation to finish.
6. Open the saved proof folder from the success dialog if needed.
7. Upload the `*.presentation.tlsn` file to a report in the webapp.

What the webapp does next:

- verifies the presentation through `tlsn-api /verify`
- stores the proof and verified metadata on the report
- renders the verified request and response
- marks hidden-request proofs as needing company confirmation before reveal

### Flow B: Hidden request / gated reveal

Use this flow when the researcher wants to prove the response without fully disclosing the request up front.

1. In Burp, generate a proof with redactions or hide the full request.
2. Burp saves both:
   - `host.presentation.tlsn`
   - `host.full.presentation.tlsn`
3. Upload `host.presentation.tlsn` to the report first.
4. The company reviews the verified response data and sets a bounty amount.
5. After that unlock step, the reporter uploads `host.full.presentation.tlsn`.
6. The webapp verifies that both presentations come from the same notarized session.

The company is expected to confirm the issue using the verified TLSNotary response before the full request is revealed.

### Flow C: Dummy payout

Any company-owned report can be paid from:

- the company dashboard report table
- the individual report detail page

When the button is clicked, the app records a paid `Payment` row and updates the balances in SQLite immediately. There is no external payment processor.

## TLSNotary HTTP API

`tlsn-api` exposes three main endpoints.

### `GET /health`

Returns a simple health payload showing the API status and configured notary address.

### `POST /verify`

Request:

```json
{
  "presentation_b64": "<base64 presentation bytes>",
  "file_name": "proof.presentation.tlsn"
}
```

Response:

- `status`
- `attestation_fingerprint`
- `server_name`
- `session_time`
- `sent_data`
- `recv_data`
- `sent_len`
- `recv_len`

The returned transcript text uses `X` for hidden bytes.

### `POST /prove`

Minimum request:

```json
{
  "target_host": "example.com",
  "target_port": 443,
  "request_b64": "<base64 raw HTTP request>",
  "persist": true
}
```

Common fields supported by the current code:

- `target_host`
- `target_port`
- `request_b64`
- `persist`
- `hide_request`
- `timeout_seconds`
- `output_stem`
- `max_sent_data`
- `max_recv_data`
- `redaction_rules`
- `notary_host`
- `notary_port`
- `ca_cert_path`

Supported redaction rule types:

- `HEADER`
- `BODY`
- `SUBSTRING`
- `FULL_REQUEST`

When the request is redacted, the response may include:

- `full_presentation_file_name`
- `full_presentation_b64`
- `persisted_full_presentation_path`

The API rejects non-TLS requests with a clear error instead of attempting to prove plain HTTP.

## Webapp Details

### Stack

- Next.js 16 App Router
- React 19
- Prisma 7 with the libSQL adapter
- SQLite
- JWT cookie auth

### Important environment variables

- `DATABASE_URL`
  Optional. Defaults to `file:<repo>/bug-bounty-platform/dev.db`
- `JWT_SECRET`
  Optional for local dev, but should be set explicitly outside a demo environment
- `TLSN_API_URL`
  Optional. Defaults to `http://127.0.0.1:8090`

### Proof upload UX

The report page currently supports:

- drag and drop
- file chooser
- paste

for both the initial proof upload and the later companion full-proof upload.

### What gets verified

Every `.presentation.tlsn` accepted by the webapp is verified through the Docker API first.

That includes:

- the initial proof upload
- the later full presentation reveal upload
- any fallback revalidation needed to recover an older missing attestation fingerprint

## Burp Extension Details

### Defaults

- API URL: `http://127.0.0.1:8090`
- Notary overrides: disabled
- Output directory: `~/tlsnotary-proofs`
- Timeout: `120s`

### Output behavior

The extension writes returned artifacts directly to the configured output directory.

When the proof is redacted, it writes both:

- the redacted presentation for immediate sharing
- the full presentation for later reveal

### UI behavior

After proof generation, the result dialog keeps the saved file paths visible and includes an action to open the proof folder. That is the most reliable way to move the generated presentation into another app.

## Notes on Legacy Code

The repo still contains `tlsn/` and `components/` because the Docker wrapper depends on the upstream TLSNotary ecosystem and those sources remain useful for reference and experimentation.

However:

- the production path in this repo is `tlsn-docker/`
- the webapp does not call the vendored `tlsn/examples` code
- the Burp extension does not use the old Python bridge anymore
- the old Lit encryption prototype has been removed

## Troubleshooting

### The webapp says proof verification failed

Check:

- `tlsn-api` is running
- the API is reachable at `http://127.0.0.1:8090`
- the uploaded file is a `.presentation.tlsn` artifact, not an attestation or secrets file

### Burp proof generation returns a 502 or TLS error

Check:

- the selected request is HTTPS, not HTTP
- the API URL in Burp points to `8090`
- notary overrides are disabled unless you intentionally need them
- the Docker services are up

### A hidden proof cannot be revealed

Make sure the reporter uploads the companion `*.full.presentation.tlsn` file generated from the same TLSNotary session, not a second unrelated presentation.

### SQLite says a table is missing

Run:

```bash
cd bug-bounty-platform
npm run db:migrate
```

In normal local development, `npm run dev` and `npm run start` already do this automatically before the app boots.
