import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Ingest load profile for the Fleet Telemetry API.
//
// Shape: many devices, each posting infrequently — that is what a real fleet
// looks like. A single VU hammering one device would measure connection reuse
// and row-level contention, not ingest throughput.

const accepted = new Counter('telemetry_accepted');
const duplicates = new Counter('telemetry_duplicate_rejected');

export const options = {
  stages: [
    { duration: '30s', target: 50 },   // ramp
    { duration: '3m',  target: 50 },   // steady state — measure here
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    // Ingest returns 202 without touching the database (ADR 0001), so the
    // request should be publish latency only. If p95 climbs above this,
    // RabbitMQ is the bottleneck, not PostgreSQL.
    'http_req_duration': ['p(95)<150', 'p(99)<400'],
    'http_req_failed':   ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5067';
const DEVICE_ID = __ENV.DEVICE_ID;
const TOKEN = __ENV.DEVICE_TOKEN;

if (!DEVICE_ID || !TOKEN) {
  throw new Error('Set DEVICE_ID and DEVICE_TOKEN. Issue a token from the operator console or POST /api/v1/devices/{id}/tokens.');
}

export default function () {
  // A fresh idempotency key per reading is the honest case: a device that
  // reuses keys is testing the unique constraint, not the ingest path.
  // Set DUPLICATE_RATE to exercise the constraint deliberately.
  const dupRate = Number(__ENV.DUPLICATE_RATE || 0);
  const key = Math.random() < dupRate
    ? 'fixed-duplicate-key'
    : `${__VU}-${__ITER}-${Date.now()}`;

  const payload = JSON.stringify({
    recordedAt: new Date().toISOString(),
    idempotencyKey: key,
    metrics: {
      temperature_c: randomIntBetween(15, 85),
      battery_pct:   randomIntBetween(5, 100),
    },
  });

  const res = http.post(
    `${BASE_URL}/api/v1/devices/${DEVICE_ID}/telemetry`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      tags: { name: 'POST /telemetry' },
    },
  );

  check(res, {
    'accepted (202)': (r) => r.status === 202,
  });

  if (res.status === 202) accepted.add(1);
  if (res.status === 409) duplicates.add(1);

  // Devices report on an interval, not in a tight loop.
  sleep(randomIntBetween(1, 3));
}
