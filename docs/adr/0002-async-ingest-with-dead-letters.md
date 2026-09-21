# 0002 — Async ingest with durable dead letters

**Status:** Accepted

## Context

[ADR 0001](0001-202-accepted-tradeoff.md) returns `202` before the reading is stored. That creates an obligation: if persistence later fails, there is no open HTTP request to fail, no client waiting for a status code, and no operator watching. Without somewhere for failures to go, a bad batch of readings disappears silently — which is the worst possible outcome for a system whose entire job is recording what the fleet did.

Devices also retry. A reading that timed out at the network layer but was actually accepted will be sent again, and a naive consumer would store it twice, corrupting any aggregate computed over it.

## Decision

Two mechanisms, each addressing one half of the problem.

**Duplicates are rejected by the database.** A unique constraint on `(deviceId, idempotencyKey)` makes replays a no-op. The constraint lives in the schema rather than in consumer logic, so it holds regardless of how many consumers run or how they are deployed.

**Failures are persisted, not dropped.** `TelemetryConsumerWorker` retries a failing message up to three times. On exhaustion it writes a `DeadLetter` row capturing the message and the failure, and nacks to the RabbitMQ dead-letter exchange (`telemetry.dead-letter`). Admin endpoints under `AdminDeadLettersController` let an operator inspect, replay, or discard — from the API or the operator console.

The guarantee is: **no reading is silently lost.** Either it is stored, or it is sitting in a dead-letter row that someone can act on.

## Alternatives considered

| Option | Why not |
|---|---|
| Retry forever | One poison message blocks the queue behind it indefinitely. |
| Drop after N retries, log only | The log is not a queue. Nobody replays from a log, and the reading is gone. |
| RabbitMQ DLX alone, no database row | The DLX holds the message but gives operators no way to inspect or selectively replay without attaching to the broker. |
| Idempotency in consumer code | Correct only while exactly one consumer runs. The constraint is correct under any topology. |

## Consequences

**Dead letters need an owner.** A queue nobody inspects is a slower way of dropping data. This is an operational commitment, not just a code path — the console surfaces the count so it is visible without being asked for.

**Idempotency keys are the device's responsibility.** Firmware must generate a stable key per reading and reuse it on retry. A device generating a fresh key per attempt will write duplicates and the database cannot help.

**This is not a transactional outbox.** Worth stating plainly, because the two are easy to conflate. An outbox writes the event to a table in the same transaction as the business data, so the publish cannot be lost if the process dies after commit. Here the publish happens first and the database write happens downstream — the direction is reversed. If RabbitMQ is unreachable at publish time the API fails the request outright, which is the correct behaviour for this shape but is a different guarantee from an outbox's.
