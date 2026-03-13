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
