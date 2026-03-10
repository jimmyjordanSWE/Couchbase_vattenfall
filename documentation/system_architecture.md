# EdgeGuard System Architecture

## Overview

EdgeGuard is an offline-first edge intelligence pipeline for wind turbine monitoring. It ingests real-time turbine telemetry, scores each reading with a machine learning anomaly detector, persists data to a local Couchbase Edge Server, and automatically syncs to a central Couchbase Server when network connectivity is available.

The system is designed to survive WAN outages without losing critical fault data, using smart compaction and eviction policies to manage limited edge storage.

---

## High-Level Architecture

```
Turbine Simulator
      │  (1400ms emit interval per turbine)
      ▼
FastAPI Simulation Engine  ◄──── SSE clients (React dashboard)
      │
      ├── Isolation Forest ML  (score every reading)
      │
      ├── Couchbase Edge Server  (local REST API, port 59840)
      │         │
      │         └── Sync Gateway  (automatic replication when online)
      │                   │
      │                   └── Couchbase Server (central scope)
      │
      ├── Compaction Worker  (offline: merge consecutive normals)
      │
      └── Drain Worker  (online: edge → central, 600ms interval)
```

---

## Components

### 1. Simulation Engine (`simulation.py`)

The central orchestrator. A singleton `SimulationEngine` class owns all pipeline state and runs two async background tasks:

**Emit Loop** (1400ms interval):
- Generates one data point per enabled turbine in round-robin
- Scores the point with Isolation Forest
- Appends to in-memory `edge_storage`
- Writes to Couchbase Edge Server (non-blocking, fire-and-forget)
- Triggers compaction if `edge_storage > COMPACTION_THRESHOLD` (20)
- Evicts oldest normal data if `edge_storage >= EDGE_CAPACITY` (25)
- Publishes SSE events to all connected clients

**Drain Loop** (600ms interval):
- Runs only when `is_online = True`
- Drains up to 5 items per cycle from `edge_storage` to central
- Upserts each item to Couchbase Server via SDK
- Deletes the item from Edge Server after successful central write
- Updates `last_sync_timestamp` on each drained item

**Key constants:**
| Constant | Value | Meaning |
|---|---|---|
| `EDGE_CAPACITY` | 25 | Hard cap on edge buffer |
| `COMPACTION_THRESHOLD` | 20 | Trigger point for compaction |
| `EMIT_INTERVAL_MS` | 1400 | Time between emits per turbine cycle |
| `DRAIN_INTERVAL_MS` | 600 | Frequency of drain loop |
| `DRAIN_BATCH_SIZE` | 5 | Items moved to central per cycle |
| `TURBINE_COUNT` | 3 | Number of simulated turbines |

---

### 2. Isolation Forest ML (`anomaly_detector.py`)

A pre-trained scikit-learn `IsolationForest` that scores every sensor reading in real time.

**Features scored:**
- `vibration` (m/s²)
- `temperature` (°C)
- `rpm`
- `powerOutput` (kW)
- `windSpeed` (m/s)
- `bladePitch` (degrees)

**Training data:**
5000 samples generated with realistic wind turbine physics:
- Wind speed: Weibull-distributed (shape=2, scale=9) — matches real wind farm statistics
- RPM: linear with wind speed, clipped at rated (20 RPM)
- Power: cubic relationship with wind speed, capped at 2000 kW
- Temperature: rises with power output
- Vibration: positively correlated with RPM
- Blade pitch: inverts at high wind to feather and limit power

**Scoring:**
The `decision_function` output is normalised to 0–1 (1 = most anomalous). Readings above `ANOMALY_THRESHOLD = 0.5` are labelled `"anomaly"`.

**Fault modes generated for anomaly injection:**
| Mode | Characteristics |
|---|---|
| `overheating` | High temperature (85–120°C), elevated vibration |
| `mechanical_failure` | Extreme vibration (6–15 mm/s), low power despite moderate wind |
| `stall` | Near-zero RPM/power while wind is present, full blade pitch |
| `power_surge` | RPM and power far above rated (2400–3500 kW) |

**Persistence:**
The trained model is serialised with `joblib` to `model/isolation_forest.joblib`. On server startup, the model is loaded from disk — no retraining needed per restart. Metadata (training sample count, contamination, version) is also stored in `central.model_state` in Couchbase.

---

### 3. Couchbase Persistence Layer (`db.py`)

EdgeGuard uses two Couchbase products connected in a replication chain:

```
Edge Server (REST API) ──► Sync Gateway ──► Couchbase Server (SDK)
     port 59840                                    central scope
```

**Edge Server writes** are HTTP PUT/DELETE against the REST API:
```
PUT  http://couchbase-edge-server:59840/main.central.data/{key}
DELETE http://couchbase-edge-server:59840/main.central.data/{key}?rev={rev}
```
Deletions require fetching the current `_rev` first (Couchbase Lite protocol).

**Central Server reads/writes** use the Couchbase Python SDK directly against `central.data` and `central.model_state` collections.

**Keyspaces:**
| Keyspace | Purpose |
|---|---|
| `central.data` | All pipeline items: normal, anomaly, compacted blocks |
| `central.model_state` | Isolation Forest metadata + pipeline sequence number |

**All edge writes are fire-and-forget** using `asyncio.create_task()` — they never block the simulation loops.

**Connection recovery:** When toggling back online, `reload_edge_storage_from_server()` re-fetches all documents from Edge Server before the drain loop resumes. This handles the case where the in-memory buffer was lost (e.g., server restart during offline period).

---

### 4. Compaction Engine (inside `simulation.py`)

When offline storage pressure exceeds `COMPACTION_THRESHOLD`, the engine merges consecutive runs of `"normal"` data points into `CompactedBlock` documents — preserving anomaly readings intact.

**Algorithm:**
1. Walk `edge_storage` left to right
2. Accumulate consecutive normals (and existing compacted blocks) into a `run`
3. When an anomaly breaks the run, flush: merge the run into one `CompactedBlock`
4. Anomalies are appended to the output unchanged

**CompactedBlock fields:**
- `range` — seq span, e.g., `"1001-1025"`
- `count` — number of original readings merged
- `avgValue`, `minValue`, `maxValue`, `stdDev` — statistics over the window
- `avgAnomalyScore` — weighted average anomaly score of merged readings
- `tier` — always `1` in MVP (supports future multi-tier)

**Race condition prevention:**
Original documents are deleted from Edge Server **before** the compacted block is written. This ensures Sync Gateway never replicates both the originals and the compacted replacement.

**Eviction (last resort):**
If compaction cannot bring `edge_storage` below `EDGE_CAPACITY`, the engine calls `_drop_oldest_normal_once()` in a loop, evicting the oldest normal reading. Anomalies are **never evicted**.

---

### 5. FastAPI Backend (`main.py`)

A uvicorn-served FastAPI application with these router groups:

| Router | Prefix | Key Endpoints |
|---|---|---|
| `system_router` | `/api/system` | GET/POST pipeline start/stop/initialize |
| `connection_router` | `/api` | POST `/connection` — toggle online/offline |
| `turbines_router` | `/api/turbines` | PATCH enable/disable, POST inject anomaly |
| `storage_router` | `/api/storage` | GET edge/central, POST clear |
| `metrics_router` | `/api/metrics` | GET live metrics snapshot |
| `stream_router` | `/api/stream` | GET `/events` — SSE stream |
| `model_router` | `/api/model` | GET Isolation Forest status |

**Server-Sent Events (`/api/stream/events`):**
On connection, the client receives a `snapshot` event with the full current state (pulled from both Couchbase Edge and Couchbase Server). Subsequent events are pushed in real time:
- `telemetry` — new data point generated
- `edge_update` — edge storage state change
- `central_update` — item drained to central
- `compaction` — compaction ran
- `metrics` — updated metrics snapshot
- `system_status` — online/offline or running state changed

---

### 6. React Dashboard (`services/react-web-app`)

A React Router v7 + Tailwind CSS dashboard with a cyberpunk mission-control aesthetic.

**Layout:**
```
┌──────────────┬─────────────────────────────┬─────────────────┐
│  Turbine     │  Pipeline Flow Diagram      │  Storage Panel  │
│  Cards (3)   │  (animated)                 │  (Edge + Central)│
│              ├─────────────────────────────┤                 │
│  Connection  │  Data Tables                │                 │
│  Toggle      │  (Edge | Central | Audit)   │                 │
└──────────────┴─────────────────────────────┴─────────────────┘
```

**Real-time updates:**
The `useEventStream` hook subscribes to `/api/stream/events` and dispatches all SSE events into a Zustand store (`pipelineStore`). The UI renders directly from this store — no polling.

**Key UI interactions:**
- Toggle turbines on/off individually
- Inject anomaly burst (8 readings) into any turbine
- Toggle network online/offline (simulates WAN outage)
- Observe compaction events and storage pressure in real time

---

## Data Flow Summary

```
1. Emit:      Simulator → generate sensor reading
2. Score:     Isolation Forest → anomaly_score + label
3. Buffer:    Append to edge_storage (in-memory)
4. Persist:   PUT to Couchbase Edge Server (async)
5. Compact:   If offline + over threshold → merge normals
6. Evict:     If at capacity → drop oldest normal (never anomaly)
7. Drain:     If online → pop from edge → upsert to Couchbase Server
8. Sync:      Edge Server → Sync Gateway → Couchbase Server (automatic)
```

---

## Startup Sequence

1. FastAPI app starts, `lifespan` context initialises
2. Background task: connect to Couchbase Server (non-blocking)
3. Background task: load pre-trained Isolation Forest from disk
4. Restore `sequence_number` from `central.model_state`
5. Save model metadata to Couchbase
6. API is ready; React dashboard connects via SSE
7. Operator clicks "INITIALIZE SYSTEM" → simulation engine is marked ready
8. Operator enables turbines + clicks start → emit/drain loops begin
