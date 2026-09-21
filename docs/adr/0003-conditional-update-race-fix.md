# 0003 — Conditional UPDATE to fix the stale-detection race

**Status:** Accepted

## Context

A `BackgroundService` runs every five minutes and marks devices inactive when their last telemetry exceeds the configured threshold. The naive implementation has a race that only appears under live traffic:

1. At **T1** the job reads a device and sees `last_seen_at` is older than the threshold. The device looks stale.
2. Between T1 and T2, a telemetry reading arrives. Ingest updates `last_seen_at` to now. The device is demonstrably alive.
3. At **T2** the job writes `status = Inactive`.

A live device is now marked inactive, and stays that way until its next reading. The window is small, the fleet is large, and the job runs continuously — so this is not a theoretical race. It is a bug that shows up as intermittent, unexplainable device flapping, which is exactly the kind of defect that takes a week to track down because it never reproduces on demand.

## Decision

Guard the write with the value that was read, and let the database do the check:

```csharp
var capturedLastSeen = device.LastSeenAt;          // snapshot at read time

var affected = await db.Devices
    .Where(d => d.Id == device.Id
             && d.Status == DeviceStatus.Active
             && d.LastSeenAt == capturedLastSeen)   // the guard
    .ExecuteUpdateAsync(s =>
        s.SetProperty(d => d.Status, DeviceStatus.InActive), ct);

if (affected == 0) return;                          // someone got there first
```

The `WHERE last_seen_at = @capturedLastSeen` clause carries the value observed at T1 into the write at T2. The database evaluates the predicate and applies the update as one atomic operation. If a reading arrived in between, `last_seen_at` no longer matches, zero rows are affected, and the job correctly skips the device.

This is optimistic concurrency: assume no conflict, detect it at write time, handle it if you were wrong.

## Alternatives considered

| Option | Why not |
|---|---|
| Application-level lock per device | Two job instances locking different devices and waiting on each other deadlock. Also does not survive running more than one process. |
| `SELECT … FOR UPDATE` | Holds a transaction open across the read-decide-write window and serialises the job against live ingest — penalising the hot path to fix a cold-path bug. |
| Re-read and compare before writing | Narrows the window without closing it. The race simply moves between the second read and the write. |
| A dedicated version column | Works, but `last_seen_at` already changes on exactly the event we care about. A second column would be redundant state to keep correct. |

## Consequences

**Low contention is a precondition.** Optimistic concurrency wins when conflicts are rare. Device readings arrive infrequently relative to a five-minute sweep, so the guard almost never fails. Under high contention this would become a retry storm and pessimistic locking would be the better trade.

**A skipped device waits a full cycle.** If the guard fails, the job moves on rather than retrying. The device is re-evaluated on the next sweep. For a five-minute cycle on stale detection this is correct — it is better to be late marking a device inactive than to be wrong about it.

**No locks means no deadlocks.** The job can run alongside ingest at any concurrency without a lock-ordering discipline to get wrong.
