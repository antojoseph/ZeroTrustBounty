# TLSNotary Docker Services

`tlsn-docker/` is the active local TLSNotary integration used by both:

- `burpsuite-tlsnotary-extension/`
- `bug-bounty-platform/`

It wraps the upstream `tlsn` crate pinned to `v0.1.0-alpha.14` and exposes both CLI tools and a long-lived HTTP API.

## Binaries

This package builds:

- `tlsn-notary-server`
- `tlsn-prove`
- `tlsn-verify`
- `tlsn-api`

## Docker Compose Services

`docker-compose.yml` defines:

- `notary`
  Runs `tlsn-notary-server --bind 0.0.0.0:7047`
- `api`
  Runs `tlsn-api --bind 0.0.0.0:8090 --notary-addr notary:7047 --artifacts-dir /artifacts`
- `prover`
  Example CLI proof generation profile
- `verify`
  Example CLI verification profile

Defaults:

- notary inside Compose: `notary:7047`
- host notary port: `7048`
- API inside Compose: `0.0.0.0:8090`
- host API port: `8090`

The host API intentionally defaults to `8090`, not `8080`.

## Build

```bash
docker compose build
```

## Start

```bash
docker compose up -d notary api
```

Health check:

```bash
curl -sS http://127.0.0.1:8090/health
```

If you need different host ports:

```bash
TLSN_NOTARY_PORT=7050 TLSN_API_PORT=8091 docker compose up -d notary api
```

## HTTP API

### `GET /health`

Returns:

- `status`
- `service`
- `notary_addr`

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
- `file_name`
- `attestation_fingerprint`
- `server_name`
- `session_time`
- `sent_data`
- `recv_data`
- `sent_len`
- `recv_len`

Notes:

- the presentation is verified against the TLS certificate chain
- hidden transcript bytes are surfaced as `X` in `sent_data` and `recv_data`

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

Supported request fields in the current code:

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
- `notary_addr`
- `notary_host`
- `notary_port`
- `ca_cert_path`

Supported redaction rule types:

- `HEADER`
- `BODY`
- `SUBSTRING`
- `FULL_REQUEST`

Example with redactions:

```json
{
  "target_host": "example.com",
  "target_port": 443,
  "request_b64": "<base64 raw HTTP request>",
  "persist": true,
  "redaction_rules": [
    { "type": "HEADER", "value": "Authorization" },
    { "type": "SUBSTRING", "value": "session=" }
  ]
}
```

Success response fields:

- `status`
- `attestation_fingerprint`
- `server_name`
- `session_time`
- `sent_data`
- `recv_data`
- `sent_len`
- `recv_len`
- `presentation_file_name`
- `presentation_b64`
- `attestation_file_name`
- `attestation_b64`
- `secrets_file_name`
- `secrets_b64`
- optional `full_presentation_file_name`
- optional `full_presentation_b64`
- optional persisted artifact paths when `persist: true`

The optional full presentation is returned when the initial presentation does not reveal the full request. That is what powers the webapp's later reveal workflow.

Failure behavior:

- non-TLS requests are rejected with a clear `TLSNotary requires HTTPS` error
- bad notary overrides return a 502 with details showing that overrides are resolved inside the container

## Artifact Naming

Artifact stems are derived from the verified server name by replacing non-alphanumeric characters with `_`.

Examples:

- `example_com.presentation.tlsn`
- `example_com.full.presentation.tlsn`
- `example_com.attestation.tlsn`
- `example_com.secrets.tlsn`

When `persist: true`, artifacts are written to `./artifacts` on the host and `/artifacts` inside the container.

## CLI Tools

Generate a sample proof:

```bash
docker compose run --rm prover
```

Verify a saved presentation:

```bash
docker compose run --rm verify
```

The standalone verifier also supports JSON output:

```bash
docker compose run --rm api tlsn-verify --presentation /artifacts/example_com.presentation.tlsn --json
```

## Notes

- This directory is the supported local integration layer for the Burp extension and the webapp.
- The vendored `tlsn/` workspace still exists in the repo, but it is not the service path consumed by those apps.
