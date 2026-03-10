# EdgeGuard Storage Strategy: Edge, Compaction, and Sync

## The Core Problem

Remote wind turbines operate in harsh environments where WAN connectivity is unreliable. During an outage, a turbine keeps generating data. Edge hardware has limited storage. Without smart management:

1. **Storage fills up** → blind overwrite of the oldest data
2. **Critical fault data gets dropped** → maintenance teams arrive with no evidence of what happened

EdgeGuard solves this with a **two-tier storage architecture** and a **compaction policy** that maximises the value of every byte stored on the edge.

---

## Two-Tier Storage Architecture

```
┌─────────────────────────────────────────────────────┐
│  EDGE TIER (Couchbase Edge Server)                  │
│                                                     │
│  • Capacity: 25 items                               │
│  • Compaction threshold: 20 items                   │
│  • Write: REST API (fire-and-forget)                │
│  • Persists across server restarts                  │
│  • Serves as offline buffer during WAN outages      │
└────────────────────┬────────────────────────────────┘
                     │ Automatic replication
                     │ (Couchbase Sync Gateway)
                     ▼
┌─────────────────────────────────────────────────────┐
│  CENTRAL TIER (Couchbase Server)                    │
│                                                     │
│  • Unlimited capacity                               │
│  • Write: Couchbase SDK (upsert)                    │
│  • Receives drained data when online                │
│  • Full audit trail for analysis                    │
└─────────────────────────────────────────────────────┘
```

---

## Document Types

All items share the same `central.data` collection, distinguished by a `type` field:

### DataPoint (type: "normal" | "anomaly")
```json
{
  "id": "seq_1042",
  "seq": 1042,
  "sourceTurbine": 2,
  "sensors": {
    "vibration": 1.23,
    "temperature": 54.1,
    "rpm": 14.5,
    "powerOutput": 1450.0,
    "windSpeed": 11.2,
    "bladePitch": 7.8
  },
  "value": 1450.0,
  "anomalyScore": 0.12,
  "type": "normal",
  "timestamp": 1741600000000
}
```

### CompactedBlock (type: "compacted")
```json
{
  "id": "compact_1741600000000_0",
  "seq": 1010,
  "sourceTurbine": 1,
  "range": "1010-1024",
  "tier": 1,
  "count": 15,
  "sensors": { "...weighted averages..." },
  "value": 1380.0,
  "avgValue": 1380.0,
  "minValue": 1100.0,
  "maxValue": 1650.0,
  "stdDev": 142.3,
  "avgAnomalyScore": 0.08,
  "timestamp": 1741599900000,
  "type": "compacted"
}
```

---

## Edge Storage Lifecycle

### Phase 1: Normal Operation (Online)

```
edge_storage: [N, N, N, N, N]  (length ≤ threshold)
Drain loop:   pops 5 items → upserts to central → deletes from Edge Server
```

Items flow through edge quickly. Storage stays low.

### Phase 2: Offline Accumulation

```
Connection toggled offline. Drain loop pauses.

edge_storage: [N, N, A, N, N, N, N, A, N, N, N, N, N, N, N, N, N, N, N, N]
                                                              ^-- THRESHOLD (20)
```

N = normal, A = anomaly

### Phase 3: Compaction Triggered

When `len(edge_storage) > COMPACTION_THRESHOLD`:

1. Walk the buffer, find consecutive runs of normals
2. Merge each run into one CompactedBlock
3. Delete originals from Edge Server (prevents replication seeing both)
4. Write compacted block to Edge Server

```
Before: [N, N, A, N, N, N, N, A, N, N, N, N, N, N, N, N, N, N, N, N]  (20 items)
After:  [CB(2), A, CB(4), A, CB(12)]                                    (5 items)
```

15 original data points → 5 items. 70% compression while preserving both anomalies.

### Phase 4: Capacity Enforcement (Last Resort)

If compaction alone cannot bring storage below `EDGE_CAPACITY` (25):

```python
def _drop_oldest_normal_once(self):
    for i, item in enumerate(self.edge_storage):
        if _classify_edge_item(item) == "normal":
            self.edge_storage.pop(i)
            return item
    return None  # All remaining items are anomalies — nothing dropped
```

The engine evicts normals one by one until under capacity. **Anomalies are never evicted.**

### Phase 5: Coming Back Online

```
POST /api/connection {"online": true}
```

1. `reload_edge_storage_from_server()` — re-reads all documents from Couchbase Edge Server (handles restart during offline period)
2. If still over threshold, compact before draining
3. Drain loop resumes — uploads edge buffer to central at up to 5 items/600ms

---

## Compaction Algorithm Detail

**Consecutive-run compaction** groups adjacent normals:

```
Input:  [N1, N2, N3, A4, N5, N6, CB(N7-N10), N11, A12, N13]

Processing:
  - N1, N2, N3 → run starts
  - A4 breaks run → flush: merge N1+N2+N3 → CB(1-3)
  - N5, N6, CB(N7-N10) → run (CompactedBlocks join runs too)
  - N11 → run continues
  - A12 breaks run → flush: merge N5+N6+CB(7-10)+N11 → CB(5-11)
  - N13 → run starts
  - end of buffer → flush: N13 is a single item → kept as DataPoint

Output: [CB(1-3), A4, CB(5-11), A12, N13]
```

**Why anomalies and compacted blocks break runs differently:**
- Anomalies always break runs (they must never be merged)
- Existing CompactedBlocks *join* runs (they get merged further)

**Weighted merging:**
All statistics in a CompactedBlock are count-weighted, so a block covering 10 readings and a block covering 2 readings merge correctly:

```python
weighted_val = sum(item.value * item.count for item in run) / total_count
```

---

## Storage Pressure Metric

```python
def _compute_pressure(edge_length: int) -> float:
    half = COMPACTION_THRESHOLD * 0.5  # = 10
    if edge_length <= half:
        return 0.0
    return min(1.0, (edge_length - half) / (EDGE_CAPACITY - half))
```

| Edge Length | Pressure |
|---|---|
| 0–10 | 0% |
| 15 | 33% |
| 20 (threshold) | 67% |
| 25 (capacity) | 100% |

The UI shows a live pressure bar that turns amber at 60% and red at the compaction zone. This is the key visual in the demo.

---

## Couchbase Integration Details

### Edge Server (Couchbase Lite)

The Edge Server exposes a REST API compatible with Couchbase Lite. EdgeGuard uses it as a local embedded database:

```
PUT    /main.central.data/{key}          → write/update document
GET    /main.central.data/{key}          → read document (used to fetch _rev for delete)
DELETE /main.central.data/{key}?rev={r}  → delete (requires _rev)
POST   /main.central.data/_all_docs      → list all documents
POST   /main.central.data/_bulk_docs     → bulk delete
```

All calls use `httpx.AsyncClient` with a 5s timeout. Failures are logged as warnings and never crash the simulation.

### Sync Gateway

Sync Gateway receives all writes from Edge Server automatically via Couchbase's built-in replication. No application code is needed to trigger this — the replication is configured at infrastructure level. When the WAN connection is restored, Sync Gateway catches up the backlog.

### Couchbase Server (SDK)

Central writes use the Couchbase Python SDK. All SDK calls are blocking (the SDK is synchronous), so EdgeGuard runs them in a thread pool to avoid blocking the async event loop:

```python
async def _run_in_thread(fn, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))
```

### Document Key Scheme

| Document | Key pattern |
|---|---|
| Normal reading | `seq_{sequence_number}` |
| Anomaly reading | `seq_{sequence_number}` |
| Compacted block | `compact_{timestamp_ms}_{block_index}` |
| Model metadata | `current_model` |
| Pipeline state | `pipeline_state` |

---

## Guarantees

| Guarantee | Mechanism |
|---|---|
| Anomalies never lost to storage pressure | `_classify_edge_item()` check before eviction |
| No duplicate sync on reconnect | Drain advances only after central ack |
| No replication race on compaction | Originals deleted before compacted block written |
| State survives server restart | Sequence number persisted to `central.model_state` |
| In-memory buffer survives restart | `reload_edge_storage_from_server()` on reconnect |
