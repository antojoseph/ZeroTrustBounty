# TLSNotary BurpSuite Extension

Generate TLSNotary proofs from BurpSuite Repeater and save modern `.tlsn` artifacts locally.

The extension now talks directly to the dockerized TLSNotary HTTP API in `../tlsn-docker` instead of the older Python bridge flow.

## Prerequisites

- BurpSuite Community or Professional with the Montoya API
- JDK 17+ to build the extension
- Docker Desktop or compatible local Docker runtime

## Start the TLSNotary services

From `../tlsn-docker`:

```bash
docker compose build
docker compose up -d notary api
```

Defaults:

- API URL: `http://127.0.0.1:8080`
- If `8080` is already in use, start Compose with `TLSN_API_PORT=<port>` and point the extension at that URL

## Build the extension

```bash
./scripts/build_extension.sh
```

The build outputs:

- `burpsuite-tlsnotary-extension/tlsnotary-burp-extension.jar`

## Load in BurpSuite

1. Open `Extensions`
2. Click `Add`
3. Choose extension type `Java`
4. Select `tlsnotary-burp-extension.jar`

## Configure

Open the `TLSNotary` tab in BurpSuite and set:

- `API URL`: TLSNotary API endpoint, usually `http://127.0.0.1:8080`
- `Proof Output Directory`: where `.presentation.tlsn`, `.attestation.tlsn`, and `.secrets.tlsn` files should be saved
- `Timeout`: maximum seconds to wait for proof generation
- `Hide request by default`: optional default redaction behavior

The notary host/port and CA bundle fields are available as optional overrides if you are not using the default dockerized setup.

## Generate a proof

1. Send a request in Repeater
2. Right-click the request
3. Choose one of the TLSNotary proof actions
4. Wait for the dockerized API to generate the proof
5. Review the saved artifact paths in the success dialog

Saved files:

- `*.presentation.tlsn`
- `*.attestation.tlsn`
- `*.secrets.tlsn`

The redaction options still apply to the request transcript. Hidden bytes remain committed in the proof but are not revealed to verifiers.
