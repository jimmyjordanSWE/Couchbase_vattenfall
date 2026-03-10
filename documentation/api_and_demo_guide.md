# EdgeGuard API Reference & Demo Guide

---

## API Reference

Base URL: `http://localhost:8000` (or configured port)

### System Control

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/system/status` | Pipeline status (running, online, turbines) |
| `POST` | `/api/system/initialize` | Mark system as initialised |
| `POST` | `/api/system/start` | Start emit + drain loops |
| `POST` | `/api/system/stop` | Stop loops |

**Status response:**
```json
{
  "isRunning": true,
  "isInitialized": true,
  "isOnline": true,
  "sequenceNumber": 1247,
  "enabledTurbines": [1, 2, 3]
}
```

---

### Connection Control

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `POST` | `/api/connection` | `{"online": true/false}` | Toggle WAN connectivity |

Going **online** triggers `reload_edge_storage_from_server()` before resuming the drain loop — ensuring any data that accumulated during the offline period (including across restarts) is properly synced.

---

### Turbine Control

| Method | Endpoint | Body | Description |
|---|---|---|---|
| `PATCH` | `/api/turbines/{id}` | `{"enabled": true/false}` | Enable/disable turbine |
| `POST` | `/api/turbines/{id}/anomaly` | — | Inject 8-reading anomaly burst |
| `DELETE` | `/api/turbines/{id}/anomaly` | — | Cancel active anomaly burst |
| `GET` | `/api/turbines/{id}/history` | — | Last 30 readings for turbine |

Valid turbine IDs: `1`, `2`, `3`

---

### Storage

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/storage/edge` | Edge Server documents (up to 25) |
| `GET` | `/api/storage/central` | Central Server documents (up to 30) |
| `POST` | `/api/storage/edge/clear` | Clear edge buffer + Edge Server docs |
| `POST` | `/api/storage/central/clear` | Clear central buffer + Couchbase docs |
| `POST` | `/api/storage/clear` | Clear everything (stops simulation first) |

---

### Metrics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/metrics` | Live metrics snapshot |

**Metrics response:**
```json
{
  "totalPacketsEmitted": 512,
  "totalAnomalies": 24,
  "edgePressure": 0.67,
  "compactionCount": 3,
  "lastSyncTimestamp": 1741600000000,
  "edgeStorageLength": 18,
  "centralStorageLength": 30
}
```

---

### Real-Time Stream (SSE)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/stream/events` | Server-Sent Events stream |

**Initial event: `snapshot`**
Sent immediately on connection. Contains full current state from Couchbase (not just in-memory):
```json
{
  "edgeStorage": [...],
  "centralStorage": [...],
  "metrics": {...},
  "systemStatus": {...},
  "compactionLogs": [...],
  "compactionCount": 3
}
```

**Stream event types:**

| Event | Payload | Trigger |
|---|---|---|
| `snapshot` | Full state | New SSE connection |
| `telemetry` | New DataPoint | Each emit loop tick |
| `edge_update` | Item + storage length + pressure | Item added to edge |
| `central_update` | Item + lastSyncTimestamp | Item drained to central |
| `compaction` | Log entry + full edge state | Compaction ran |
| `metrics` | Metrics object | Any state change |
| `system_status` | Status object | Online/offline or start/stop |
| `keepalive` | (empty comment) | Every 15s if no events |

---

### Model

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/model/status` | Isolation Forest status |

---

## Demo Guide

### Setup Checklist

Before the demo:

1. **Train the model** (one-time, already done):
   ```bash
   cd services/python-fast-api
   python train_model.py
   ```
2. **Start all services** via Polytope (Docker)
3. **Open the dashboard** at the React web app URL
4. Verify the boot overlay shows "EDGEGUARD AI" with all status dots blinking

---

### Demo Flow (5 minutes)

#### Step 1: Boot (30s)
- Dashboard shows boot overlay: `EDGEGUARD AI — Edge-Cloud Pipeline Intelligence`
- Status indicators for TURBINES / EDGE AI / COUCHBASE / SYNC VALVE appear sequentially
- Click **"INITIALIZE SYSTEM"** — the intro tour begins

**What to say:** *"This is our command centre for a fleet of offshore wind turbines. Everything you see is live — real sensor data, real ML inference, real database writes."*

---

#### Step 2: Start the Pipeline (30s)
- Enable all 3 turbines using the toggle cards on the left
- Click **Start**
- Observe: telemetry starts flowing in the pipeline diagram, data appears in the edge storage table

**What to say:** *"Three turbines are now generating telemetry — vibration, temperature, RPM, power output, wind speed, blade pitch. Every reading is immediately scored by an Isolation Forest model running locally on the edge. No cloud call. No latency."*

---

#### Step 3: Show Normal Operation (30s)
- Point to the **Edge Storage panel** — items flowing through, pressure near zero
- Point to **Central Storage** — items arriving after sync
- Show the data table: all readings showing `normal` type with low anomaly scores (< 0.3)

**What to say:** *"During normal operation, data flows straight through edge to central. The edge buffer acts as a transit zone. Watch the pressure — it's nearly zero because data is draining as fast as it arrives."*

---

#### Step 4: Inject an Anomaly (30s)
- Click **"Inject Anomaly"** on Turbine 2
- Watch: 8 readings appear with `anomaly` type and high scores (> 0.5)
- The data table shows them highlighted in red

**What to say:** *"Let me simulate a gearbox fault. The Isolation Forest immediately detects the anomalous combination: temperature spiking to 110°C, vibration at 8mm/s, power dropping despite good wind. Score goes from 0.1 to 0.8+. These are flagged as critical."*

---

#### Step 5: Go Offline — The Critical Demo (60s)
- Click the **Connection Toggle** → OFFLINE
- Let the simulation run — watch edge storage fill up
- Storage pressure bar rises: green → amber → red
- When pressure hits the compaction zone, observe the **Compaction Log** firing
- Show: anomalies are preserved intact; normal data gets merged into CompactedBlocks

**What to say:** *"Now the WAN goes down. This is the scenario that keeps operators up at night. Data keeps coming — 3 turbines, 1.4 seconds per reading. The edge buffer starts filling. Once we cross 20 items, compaction kicks in automatically."*

*"Watch the log — it's merging runs of 10, 12, 15 normal readings into single compact blocks. We went from 22 items to 6. But look — the anomaly readings? Completely untouched. They will never be deleted."*

---

#### Step 6: Show Storage Pressure Surviving (30s)
- Inject another anomaly while offline
- Show that even at full capacity, anomalies accumulate
- Normal data continues to be compressed/evicted, anomalies are always preserved

**What to say:** *"Even at 100% storage pressure, the system keeps accepting data. It just makes smarter choices about what to keep. Every fault — every anomaly — survives. Because that's the evidence maintenance teams need."*

---

#### Step 7: Come Back Online — The Payoff (30s)
- Click the **Connection Toggle** → ONLINE
- Watch: drain loop resumes, items flow to central one by one
- The `lastSync` timestamp updates every 600ms
- Edge storage drains down to near zero
- Central storage grows with all the accumulated data

**What to say:** *"WAN is restored. EdgeGuard immediately begins syncing. It reloads any data that persisted on the Couchbase Edge Server — even data from before a restart. Everything drains to central. The anomalies arrive intact. The maintenance report writes itself."*

---

#### Step 8: Close (30s)
- Point to the central storage table — mix of normal readings, compacted blocks, and anomalies
- Highlight the compacted blocks showing `range: "1010-1022"` — 12 readings in 1 document

**What to say:** *"This is the full picture from the outage. We preserved 100% of the fault data. We compressed 85% of the routine readings. Couchbase Edge Server, Sync Gateway, and Couchbase Server — working exactly as designed for industrial edge workloads."*

---

### Key Numbers to Mention

| Metric | Value |
|---|---|
| Turbines simulated | 3 |
| Emit rate | 1 reading per 1.4 seconds (per turbine) |
| ML model training samples | 5,000 |
| ML inference time | < 1ms (single matrix operation) |
| Edge capacity | 25 items |
| Compaction trigger | 20 items |
| Drain rate (online) | 5 items per 600ms |
| Anomaly preservation | 100% — never evicted |

---

### Troubleshooting During Demo

| Issue | Fix |
|---|---|
| No data flowing | Check turbines are enabled AND simulation is started |
| Central storage not growing | Verify online toggle is ON |
| Anomalies not showing red | Click "Inject Anomaly" on a turbine card |
| Storage not draining | Make sure connection is ONLINE after offline demo |
| Edge pressure stuck at 0 | Let more turbines run to fill buffer faster |
