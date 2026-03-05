# Module I/O Contracts (MVP)

This document defines strict input/output contracts per module so components can be developed independently and swapped without breaking the pipeline.

## 1. Shared Envelope

All modules pass the same envelope shape.

```json
{
  "meta": {
    "trace_id": "uuid",
    "device_id": "TURBINE_01",
    "seq": 12001,
    "ts": "2026-03-05T12:00:01Z",
    "source_type": "simulator"
  },
  "signals": {
    "temperature_c": 66.1,
    "vibration_mm_s": 2.2,
    "rpm": 1498.0,
    "power_kw": 1193.0,
    "wind_speed_m_s": 10.4
  },
  "features": {},
  "inference": {},
  "storage": {},
  "sync": {}
}
```

## 2. Module Contracts

### Module A: Simulator

Input:
- Scenario config (`seed`, `cadence_ms`, `fault_mode`, `device_count`)

Output:
- Envelope with populated `meta` + `signals`
- `features`, `inference`, `storage`, `sync` empty

Errors:
- Invalid scenario config -> startup failure

---

### Module B: Ingest API

Input:
- HTTP payload:
  - `{ "events": [EnvelopeLike] }` or single envelope-like object

Output:
- Accepted events forwarded to next stage unchanged in content
- HTTP ack:

```json
{
  "accepted": 100,
  "rejected": 0,
  "last_seq": 12001
}
```

Validation (MVP required):
- `meta.device_id`
- `meta.seq`
- `meta.ts`
- `signals` exists

---

### Module C: Inference Adapter (Swappable)

Interface:
- `process(envelope) -> envelope`

Input:
- Envelope with `meta` + `signals`

Output:
- Same envelope with `inference` populated:

```json
{
  "inference": {
    "risk_score": 0.42,
    "risk_class": "normal",
    "model_id": "stub-v1"
  }
}
```

MVP implementation:
- `StubInferenceAdapter`

Future implementation:
- `IsolationForestAdapter`

Contract rule:
- Downstream modules must not depend on adapter internals, only `inference` fields.

---

### Module D: Persistence (Couchbase)

Input:
- Envelope with `meta`, `signals`, `inference`

Output:
- `event` document write
- `manifest` upsert/update
- Envelope updated with write metadata:

```json
{
  "storage": {
    "event_key": "event::TURBINE_01::12001",
    "manifest_key": "manifest::TURBINE_01",
    "stored": true
  }
}
```

---

### Module E: Pressure Policy Worker

Input:
- Storage pressure metrics
- Query result over persisted events

Output:
- Deletes eligible events
- Writes `prune_batch` doc
- Emits policy action event

`prune_batch` shape:

```json
{
  "type": "prune_batch",
  "device_id": "TURBINE_01",
  "from_seq": 8000,
  "to_seq": 8200,
  "dropped_count": 201,
  "reason": "pressure_XY",
  "ts": "2026-03-05T13:22:00Z"
}
```

Rules:
- Never prune `inference.risk_class == "critical"`
- Prune oldest low-priority `normal` first

---

### Module F: Sync Worker

Input:
- Manifest checkpoint (`last_synced_seq`)
- Unsynced event range
- Network state

Output:
- Upload payload to central endpoint
- Manifest update (`last_synced_seq`)
- Sync status record:

```json
{
  "sync": {
    "uploaded_from_seq": 11801,
    "uploaded_to_seq": 12001,
    "status": "ok"
  }
}
```

---

### Module G: Central Upload Endpoint (Mock)

Input:
- Batched events from sync worker

Output:
- Ack with accepted range

```json
{
  "accepted": 200,
  "from_seq": 11801,
  "to_seq": 12000
}
```

Behavior:
- Idempotent on `(device_id, seq)`

## 3. Stage Wiring Contract

Pipeline order:

1. Simulator -> Ingest
2. Ingest -> Inference Adapter
3. Inference Adapter -> Persistence
4. Persistence -> (Pressure Worker loop + Sync Worker loop)
5. Sync Worker -> Central Upload

No module may mutate fields owned by earlier modules except by adding new sections (`features`, `inference`, `storage`, `sync`).

## 4. Versioning

Add envelope version in `meta`:

```json
{
  "meta": {
    "schema_version": "1.0.0"
  }
}
```

Breaking changes require version bump and compatibility note.

## 5. Minimum Acceptance Tests

- Ingest rejects envelopes missing required fields.
- Inference adapter always returns `risk_score` + `risk_class`.
- Persistence creates `event` and updates `manifest`.
- Pressure worker never deletes `critical`.
- Sync worker advances `last_synced_seq` only after successful central ack.
