# TLSNotary Burp Suite Extension

This extension generates TLSNotary proofs directly from Burp Suite traffic and writes modern `.tlsn` artifacts to disk.

It talks to the Dockerized HTTP API in `../tlsn-docker`. The old Python bridge flow has been removed.

## Prerequisites

- Burp Suite Community or Professional
- JDK 17+
- Gradle or a Gradle wrapper
- Docker Desktop or another local Docker runtime

## Start the TLSNotary services

From `../tlsn-docker`:

```bash
docker compose build
docker compose up -d notary api
```

Defaults:

- API URL: `http://127.0.0.1:8090`
- Host notary port: `7048`
- Internal notary address used by the API: `notary:7047`

## Build

```bash
./scripts/build_extension.sh
```

Output:

- `burpsuite-tlsnotary-extension/tlsnotary-burp-extension.jar`

## Load in Burp

1. Open `Extensions`
2. Click `Add`
3. Choose extension type `Java`
4. Select `tlsnotary-burp-extension.jar`

## Configure

Open the `TLSNotary` tab and set:

- `API URL`
  Usually `http://127.0.0.1:8090`
- `Proof Output Directory`
  Defaults to `~/tlsnotary-proofs`
- `Proof Generation Timeout`
  Defaults to `120`
- `Hide request by default`
  Optional convenience toggle

Advanced:

- `Use custom notary / CA overrides` should remain disabled for the default Docker Compose setup
- if you enable overrides, those names and paths are resolved inside the TLSNotary API container, not on the Burp host

## Context Menu Actions

The extension registers three actions in Repeater and Proxy:

- `Generate TLSNotary Proof`
- `Generate TLSNotary Proof (with Redactions)`
- `Generate TLSNotary Proof (Hide Entire Request)`

The redaction dialog supports:

- individual request header redaction
- full request body redaction
- literal substring redaction
- full request hiding

## What Gets Saved

For a normal proof:

- `*.presentation.tlsn`
- `*.attestation.tlsn`
- `*.secrets.tlsn`

For a redacted proof:

- `*.presentation.tlsn`
- `*.full.presentation.tlsn`
- `*.attestation.tlsn`
- `*.secrets.tlsn`

The companion `*.full.presentation.tlsn` comes from the same notarized TLS session and is meant for later reveal workflows in the webapp.

## Usage

1. Send an HTTPS request to Repeater.
2. Right-click the request.
3. Choose one of the TLSNotary proof actions.
4. Wait for the API to generate the proof.
5. Use the success dialog to inspect the saved paths.
6. Open the proof folder if you want to drag the generated presentation into another app.

Important:

- plain HTTP requests are rejected before the API call
- the extension sends the raw Burp request bytes to `POST /prove`
- the API returns base64 artifact bytes, which the extension writes to disk

## Result Dialog

After a successful run, the dialog:

- shows the saved artifact paths in a bounded window
- keeps `Copy Proof to Clipboard`
- adds `Open Proof Folder`

The folder action is the most reliable way to move the generated presentation into the webapp.

## Integration with the Webapp

The expected webapp flow is:

1. Upload the initial `*.presentation.tlsn`
2. If the proof hid request bytes, wait for the company to unlock the reveal step
3. Upload the matching `*.full.presentation.tlsn`

The webapp verifies both proofs through the same TLSNotary API.
