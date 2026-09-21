# Contributing

This repository holds **design documentation** for a private implementation. The code is not here, so there is nothing to build and no pull request against the application to merge.

That does not make it closed.

## What is welcome

**Questions and challenges on the design.** The [ADRs](docs/adr/) each state a decision, the alternatives rejected, and what the choice cost. If you think a trade-off is wrong, or that a rejected alternative was the better call, open an issue — that is a conversation worth having and the reasoning is written down precisely so it can be argued with.

**Corrections.** If something here is factually wrong, unclear, or contradicts itself, say so. PRs against the Markdown are fine.

**Load-test improvements.** [`load/`](load/) is real, runnable code. It targets the live deployment, so changes to the k6 script or the measurement methodology can be tested by anyone.

## What cannot be accepted

Pull requests against the API, the operator console or the test suite — none of it is in this repository.

## If you want to read the code

Ask. For hiring conversations, access can be arranged.

## Where the interesting parts are

- [ADR 0001](docs/adr/0001-202-accepted-tradeoff.md) — accepting telemetry with `202`, and the cost that comes with it: a device cannot read its own write
- [ADR 0002](docs/adr/0002-async-ingest-with-dead-letters.md) — why returning `202` creates an obligation to make failure durable, and why this is **not** a transactional outbox
- [ADR 0003](docs/adr/0003-conditional-update-race-fix.md) — a race that only appears under live traffic, fixed with a guarded conditional UPDATE rather than a lock
- [ADR 0004](docs/adr/0004-in-process-cache-known-limit.md) — a cache that is deliberately wrong at multi-instance scale, with the limitation documented rather than hidden
