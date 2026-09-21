# 0001 — Accept telemetry with 202 rather than 201

**Status:** Accepted

## Context

Telemetry ingest is the hot path. Devices in the field post readings continuously, and each `POST /api/v1/devices/{deviceId}/telemetry` is small, frequent, and not individually important — what matters is that the stream as a whole is durable.

The obvious implementation writes the reading to PostgreSQL inside the request and returns `201 Created` with the persisted row. That couples API latency directly to database write latency. When the database is slow — a checkpoint, a lock, a noisy neighbour, an index rebuild — every device waits, request threads pile up, and back-pressure propagates to hardware that has no useful way to respond to it.

## Decision

`POST /telemetry` validates the request, publishes to the RabbitMQ `telemetry.readings` queue, and returns **`202 Accepted`**. A `TelemetryConsumerWorker` drains the queue and writes to PostgreSQL at its own pace.

`202` is the honest status code here. The server has accepted the reading for processing and has not yet stored it. Returning `201` would be a lie, and it would be a lie the client cannot detect.

## Alternatives considered

| Option | Why not |
|---|---|
| Synchronous write, `201 Created` | Couples ingest latency to database write latency. A slow database becomes a slow fleet. |
| Fire-and-forget, `204 No Content` | Tells the device nothing about whether the reading was even accepted for processing. |
| Batch endpoint only | Helps throughput but not latency coupling, and constrains firmware that reports on an event rather than on a timer. |

## Consequences

**The caller cannot read its own write.** A device that POSTs a reading and immediately queries telemetry history may not see it. This is the real cost, and it is the thing to say out loud in an interview rather than skip over. It is acceptable here because nothing in the device workflow reads back its own telemetry — the operator console does, and it tolerates a short lag.

**Errors surface later, and somewhere else.** A malformed payload that passes request validation but fails at persistence cannot be reported in the HTTP response. This is what makes [ADR 0002](0002-async-ingest-with-dead-letters.md) necessary rather than optional: once you return `202`, you owe the caller a durable failure path.

**Queue depth becomes a health signal.** If the consumer falls behind, the queue grows. Readiness checks include a queue-depth signal so this is observable rather than discovered.
