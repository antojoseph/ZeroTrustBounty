# TLSNotary Docker Flow

This directory pins the official `tlsn` Rust crates to Git tag `v0.1.0-alpha.14` and wraps them with:

- `tlsn-notary-server`: TCP notary service
- `tlsn-prove`: CLI proof generator
- `tlsn-verify`: CLI presentation verifier
- `tlsn-api`: HTTP API exposing proof generation and verification

## Build

```bash
docker compose build
```

## Start the services

```bash
docker compose up -d notary api
```

Defaults:

- Notary inside Compose: `notary:7047`
- Host notary port: `7048`
- Host API port: `8090`

Host ports are configurable:

```bash
TLSN_NOTARY_PORT=7049 TLSN_API_PORT=8091 docker compose up -d notary api
```

## HTTP API

Health:

```bash
curl http://127.0.0.1:8090/health
```

Verify a presentation:

```bash
curl -X POST http://127.0.0.1:8090/verify \
  -H 'Content-Type: application/json' \
  --data '{"presentation_b64":"<base64>","file_name":"proof.presentation.tlsn"}'
```

Generate a proof:

```bash
curl -X POST http://127.0.0.1:8090/prove \
  -H 'Content-Type: application/json' \
  --data '{"target_host":"example.com","target_port":443,"request_b64":"<base64 raw HTTP request>","persist":true}'
```

`/prove` returns:

- transcript summary (`server_name`, `session_time`, `sent_data`, `recv_data`)
- `presentation_b64`
- `attestation_b64`
- `secrets_b64`
- optional persisted artifact paths when `persist: true`

## CLI Example

Generate a proof for `example.com`:

```bash
docker compose run --rm prover
```

Verify the generated presentation:

```bash
docker compose run --rm verify
```

Artifacts are written to `./artifacts`.
