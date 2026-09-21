# 0005 — Deploy from version tags via Gitea Actions

**Status:** Accepted

## Context

CI runs on every push and pull request. Deployment is a different question with different consequences: it needs to be deliberate, traceable to an exact commit, and reversible. An earlier design used GitLab CI; the project is hosted on self-managed Gitea, so the pipeline follows the host.

## Decision

Two workflows with different triggers.

**`.gitea/workflows/ci.yml`** — on every push and pull request. Backend `dotnet test` (xUnit + Testcontainers against a real PostgreSQL container), frontend `npm ci` → lint → test → build.

**`.gitea/workflows/cd.yml`** — on tags matching `v*`, or manual `workflow_dispatch` with an explicit `image_tag`. It builds and pushes the API and UI images, runs the EF migration bundle, deploys over SSH, smoke-tests, and can roll back.

Images are tagged with both the **commit SHA** (immutable, traceable) and `latest` (what production runs). Rollback is pointing `latest` at an earlier SHA tag and re-running the deploy — no rebuild, no guessing which commit was good.

Migrations run from a **bundle built in CI** using a dedicated `migrate` stage in the Dockerfile, under a separate `fleet_telemetry_migrator` role whose credentials live only in CI secrets. The running application's database user has no DDL rights.

## Alternatives considered

| Option | Why not |
|---|---|
| Deploy on merge to main | Every merge becomes a production event. Releasing stops being a decision. |
| Migrations on application startup | Fine in development, wrong in production: N starting instances race the same migration, and the app needs DDL rights permanently. |
| Rebuild the image to roll back | Slow, and not guaranteed to reproduce the artefact that was running. |
| `latest` only | Nothing ties a running container to a commit. Debugging production starts with a guess. |

## Consequences

**Releasing requires tagging.** Deliberate by design, but it means an urgent fix is a tag away rather than a merge away. `workflow_dispatch` exists for when that matters.

**Migrations must be backward compatible for the deploy window.** The bundle runs before the new image is live, so briefly the old code runs against the new schema. Additive changes are safe; destructive ones need the usual expand/contract split across two releases.

**The runner needs real permissions** — registry push and SSH to the deploy host. Those secrets are the most sensitive thing in the repository settings and are worth auditing separately from the code.
