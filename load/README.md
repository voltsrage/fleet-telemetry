# Load testing — Fleet Telemetry API

The ingest path returns `202` without touching PostgreSQL ([ADR 0001](../docs/adr/0001-202-accepted-tradeoff.md)), so these runs measure **publish latency and queue throughput**, not database write speed. Those are different numbers and conflating them is how people end up quoting a figure they cannot defend.

## Running

Locally, against Compose:

```bash
k6 run -e DEVICE_ID=<id> -e DEVICE_TOKEN=<token> load/telemetry-ingest.js
```

Against the deployed demo:

```bash
k6 run -e BASE_URL=https://fleet-telemetry.vectur45.com \
       -e DEVICE_ID=<id> -e DEVICE_TOKEN=<token> \
       load/telemetry-ingest.js
```

Exercise the idempotency constraint deliberately:

```bash
k6 run -e DUPLICATE_RATE=0.2 ... load/telemetry-ingest.js
```

Issue a device token from the operator console, or `POST /api/v1/devices/{id}/tokens` with the operator key. The raw token is shown once.

## Publishing results

One file per run in `results/YYYY-MM-DD.md`. **State the hardware.**

> "1,800 readings/sec accepted at p95 38 ms on a 2-vCPU GCP e2-small,
> single API instance, PostgreSQL and RabbitMQ co-located"

is credible and survives a follow-up question. A bare "1,800 rps" invites one you cannot answer.

Record every time:

- [ ] Machine spec — vCPU, RAM, provider, instance type
- [ ] Topology — were PostgreSQL and RabbitMQ co-located or separate hosts?
- [ ] Instance count (see [ADR 0004](../docs/adr/0004-in-process-cache-known-limit.md) before running multi-instance)
- [ ] VU count, ramp profile, duration
- [ ] p50 / p95 / p99, not throughput alone
- [ ] Error rate and what the errors actually were
- [ ] **Consumer lag at the end of the run** — the API can accept faster than the worker drains, and a throughput number that ignores queue depth is measuring the wrong thing
- [ ] Where the bottleneck turned out to be

## The consumer-lag trap

Because ingest is async, the API will happily return `202` faster than `TelemetryConsumerWorker` can write. A run that reports high throughput while the queue grows unboundedly has measured how fast you can fill a queue.

Watch queue depth via `/metrics` or the readiness probe, and report the **sustainable** rate — the one where depth stays flat — alongside the peak accept rate. The gap between those two numbers is the interesting part, and being the person who reports both is the point.
