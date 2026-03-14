# Bug Bounty Platform

`bug-bounty-platform/` is the demo application layer for the ZeroTrustBounty repo.

It is a Next.js 16 App Router app that:

- manages user auth with JWT cookies
- stores data in SQLite through Prisma + the libSQL adapter
- accepts uploaded TLSNotary `.presentation.tlsn` files
- verifies those proofs by calling the sibling Dockerized TLSNotary API
- supports a gated reveal flow for hidden requests
- records dummy bounty payments in the database

## Stack

- Next.js 16
- React 19
- Prisma 7
- SQLite
- Tailwind CSS 4

## Local Setup

Install dependencies and start the app:

```bash
npm install
npm run db:setup
npm run dev
```

Useful scripts:

- `npm run dev`
  Runs `prisma generate`, applies migrations, then starts Next dev mode
- `npm run build`
  Production build
- `npm run start`
  Runs `prisma generate`, applies migrations, then starts Next in production mode
- `npm run db:migrate`
  Generates Prisma client and applies migrations
- `npm run db:seed`
  Seeds demo data
- `npm run db:setup`
  Runs migrations and the seed script

## Environment

Optional environment variables:

- `DATABASE_URL`
  Defaults to `file:<repo>/bug-bounty-platform/dev.db`
- `JWT_SECRET`
  Used for auth cookies
- `TLSN_API_URL`
  Defaults to `http://127.0.0.1:8090`

## TLSNotary Dependency

This app expects the sibling TLSNotary Docker API from `../tlsn-docker` to be running.

Start it from the repo root:

```bash
cd ../tlsn-docker
docker compose build
docker compose up -d notary api
```

Defaults:

- API URL: `http://127.0.0.1:8090`
- Host notary port: `7048`
- Internal notary address used by the API: `notary:7047`

## Proof Verification Flow

The report page accepts `.presentation.tlsn` uploads and verifies every presentation before storing it.

### Initial upload

Route:

- `POST /api/reports/[id]/verify-proof`

Behavior:

1. Accepts a multipart upload with a `proof` file field.
2. Rejects empty or non-`.tlsn` files.
3. Sends the uploaded presentation bytes to `tlsn-api /verify`.
4. Stores the base64 proof bytes and verified metadata on the report:
   - server name
   - session time
   - request transcript
   - response transcript
   - attestation fingerprint
5. Detects whether the request transcript still contains hidden components.

### Hidden request reveal flow

If the original presentation hides request bytes, the report enters a gated flow.

Company step:

- route: `POST /api/reports/[id]/proof-reveal`
- the company confirms a positive bounty amount
- the report is moved to `ready_for_reporter_reveal`

Reporter step:

- route: `PUT /api/reports/[id]/proof-reveal`
- the reporter uploads the companion full `.presentation.tlsn`
- the app verifies that:
  - the full presentation is valid
  - it is not still redacted
  - it has the same attestation fingerprint as the original redacted proof
  - it has the same verified server name
  - it has the same verified session time

The current implementation intentionally uses proof-to-proof matching. It does not trust pasted plaintext request bodies.

## Proof Upload UX

Both the initial upload box and the reveal upload box support:

- drag and drop
- file chooser
- paste

The UI expects modern TLSNotary binary presentations, not the old legacy JSON format.

## Dummy Payout Flow

Every company-facing report can be paid through:

- the company dashboard table
- the report detail view

Route:

- `POST /api/reports/[id]/pay`

Behavior:

- pays the current `bountyAmount` if set
- otherwise falls back to a default dummy amount of `$500`
- creates or updates a paid `Payment` row
- decrements the company `availableFunds`
- increments the program `totalPaid`
- increments the reporter reputation

This is a database-only demo payout. No real money is moved.

## Seeded Demo Accounts

All seeded users use password `password123`.

Researchers:

- `alice@researcher.com`
- `bob@hacker.io`
- `carol@security.dev`

Companies:

- `security@acmecorp.com`
- `bugs@techgiant.io`
- `security@cryptovault.fi`

Seeded company balances:

- each company starts with `$100,000` in dummy available funds

## Local Database

- default database file: `bug-bounty-platform/dev.db`
- schema: `bug-bounty-platform/prisma/schema.prisma`
- migrations: `bug-bounty-platform/prisma/migrations`
- seed data: `bug-bounty-platform/prisma/seed.ts`

## Notes

- The app hot-reloads the Prisma client in development when the schema or generated Prisma client schema changes, which avoids stale-client errors after migrations.
- The uploaded proof bytes are stored in SQLite as base64 strings on the `Report` model.
- The webapp depends on the Docker API for verification. It does not spin up Docker containers per request anymore.
