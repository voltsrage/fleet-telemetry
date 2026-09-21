# Architecture decision records — Fleet Telemetry API

One file per decision: what was chosen, what was rejected, and what it cost.

| # | Decision |
|---|---|
| 0001 | [Accept telemetry with 202 rather than 201](0001-202-accepted-tradeoff.md) |
| 0002 | [Async ingest with durable dead letters](0002-async-ingest-with-dead-letters.md) |
| 0003 | [Conditional UPDATE to fix the stale-detection race](0003-conditional-update-race-fix.md) |
| 0004 | [In-process cache, with the multi-instance limit left visible](0004-in-process-cache-known-limit.md) |
| 0005 | [Deploy from version tags via Gitea Actions](0005-gitea-cd-on-version-tags.md) |
