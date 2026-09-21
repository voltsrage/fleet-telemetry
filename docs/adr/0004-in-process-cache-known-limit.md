# 0004 — In-process cache, with the multi-instance limit left visible

**Status:** Accepted, with a known and deliberate limitation

## Context

Two read endpoints are expensive relative to how often their underlying data changes:

| Endpoint | Cache key | TTL | Reasoning |
|---|---|---|---|
| `GET /fleets/{tag}/health` | `fleet-health:{tag}` | 30s | Reflects recent ingest and stale-detection changes within a visible lag |
| `GET /fleets` | `fleet-list:{page}:{pageSize}` | 60s | Fleet membership changes rarely; a longer TTL is safe |

Fleet health aggregates across every device in a fleet. The operator console polls it. Without caching, an open dashboard generates a continuous stream of aggregate queries for data that materially changes a few times a minute.

## Decision

Cache both with `IMemoryCache` at the stated TTLs.

**`IMemoryCache` is per-process.** With two API instances behind a load balancer, each holds its own cache. A reading ingested through instance A updates `last_seen_at` in PostgreSQL, but instance B's cached health snapshot does not change until its own TTL expires. Both instances can return different health for the same fleet at the same moment.

That limitation is **known, documented, and deliberately left in place.** The correct fix at scale is a distributed cache — `IDistributedCache` backed by Redis, shared across instances. This project does not implement it, because the in-process version makes the failure mode observable rather than theoretical.

## Alternatives considered

| Option | Why not *here* |
|---|---|
| Redis via `IDistributedCache` | The correct answer at multi-instance scale. Adds an infrastructure dependency this deployment does not otherwise need, and hides a trade-off worth being able to demonstrate. |
| No caching | An open dashboard becomes a continuous aggregate query load for data that changes a few times a minute. |
| HTTP response caching | Moves the staleness to the client and makes it harder to reason about, without removing it. |
| Cache invalidation on write | Fails for the same reason the cache does — instance A cannot invalidate instance B's memory. |

## Consequences

**This API is stateful in a way that constrains scaling.** Two instances are not interchangeable from a caller's perspective for these two endpoints. Any horizontal scale-out has to either accept up-to-TTL divergence between instances, pin clients to an instance, or make this swap first.

**The swap is intentionally cheap.** `FleetService` currently depends on `IMemoryCache` directly. Putting an `IFleetCacheService` seam in front of it makes moving to a `RedisFleetCacheService` a one-file registration change with no impact on `FleetService`. That refactor is tracked and is the first thing to do before this runs on more than one instance.

**Bounded staleness is a product decision, not an accident.** 30 seconds on fleet health was chosen because an operator watching a dashboard tolerates half a minute of lag on an aggregate. If that assumption stops holding, the TTL is the dial — not the cache strategy.
