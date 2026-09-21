# Contributing

## Getting set up

```bash
cp .env.example .env
docker compose up
dotnet test
```

The operator console lives in `FleetTelemetryUI/` (`npm ci && npm run dev`). Its built-in device simulator is the quickest way to generate traffic without real hardware.

## Before opening a PR

- [ ] `dotnet test` passes — integration tests use Testcontainers, so Docker must be running
- [ ] Frontend changes: `npm test` and `npx playwright test` pass
- [ ] New behaviour has a test; database-level behaviour is tested against real PostgreSQL, not an in-memory provider
- [ ] A decision future-you would question has an ADR in [`docs/adr/`](docs/adr/)

## Conventions

Branches are named for intent: `feat/…`, `fix/…`, `chore/…`.

Deploys run from `v*` tags, not from merges ([ADR 0005](docs/adr/0005-gitea-cd-on-version-tags.md)). Migrations must be backward compatible for the duration of a deploy — the migration bundle runs before the new image goes live, so old code briefly runs against the new schema. Destructive changes need an expand/contract split across two releases.
