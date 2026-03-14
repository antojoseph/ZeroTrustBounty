# Bug Bounty Platform

Next.js app for the `bug-bounty-platform/` project. It uses Prisma with SQLite by default and stores the local database in `bug-bounty-platform/dev.db`.

## Setup

```bash
npm install
npm run db:migrate
npm run dev
```

If you want sample data as well:

```bash
npm run db:setup
```

`npm run dev` and `npm start` both apply Prisma migrations before launching the app, so a fresh local checkout does not fail with `SQLITE_ERROR: no such table`.

## TLSNotary Verification

The report page accepts `.presentation.tlsn` files and verifies them by calling the sibling dockerized TLSNotary HTTP API.

Start that service from `../tlsn-docker`:

```bash
docker compose build
docker compose up -d notary api
```

Defaults:

- TLSNotary API URL: `http://127.0.0.1:8090`
- If port `8090` is already in use, start Compose with `TLSN_API_PORT=<port>` and run the app with `TLSN_API_URL=http://127.0.0.1:<port>`

If a TLSNotary proof hides parts of the HTTP request, the report enters a gated flow:

- The company validates the bug using the verified TLSNotary HTTP response
- The company confirms a bounty amount to unlock the next step
- The reporter reveals the full request, and the app checks that it still matches the original proof outside the hidden sections

## Local database

- Default database: `bug-bounty-platform/dev.db`
- Migrations: `bug-bounty-platform/prisma/migrations`
- Seed script: `npm run db:seed`

## Seeded demo accounts

All seeded users use password `password123`.

- Researcher: `alice@researcher.com`
- Researcher: `bob@hacker.io`
- Researcher: `carol@security.dev`
- Company: `security@acmecorp.com`
- Company: `bugs@techgiant.io`
- Company: `security@cryptovault.fi`
