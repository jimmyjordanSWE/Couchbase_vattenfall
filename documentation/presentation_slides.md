# EdgeGuard AI — Hackathon Presentation
## 12 Slides | Mixed Technical & Business Audience | ~5 minutes

---

## SLIDE 1: THE HOOK
### "The Ghost in the Turbine"

**Visual:** Dark image of an offshore wind turbine in a storm

**Headline:** Your turbine is failing. Your internet is down.

**Body:**
- Remote wind turbines generate thousands of sensor readings per hour
- WAN outages are not edge cases — they are the norm in offshore environments
- Current systems use **blind overwrite**: oldest data deleted when storage fills
- The most critical moment — a fault occurring — is often when connectivity is lost

**Speaker Notes:**
> "Imagine a million-dollar turbine failing in the middle of a North Sea storm. The network drops. The local controller starts deleting data to make room for new readings. By the time connectivity returns, the evidence of exactly what broke is gone. Your maintenance team flies out blind."

---

## SLIDE 2: THE REAL COST
### "Data Blindness Has a Price Tag"

**Visual:** Split — turbine + maintenance helicopter on left, dollar figures on right

**Headline:** When the edge fails silently, operations pay loudly.

**Body:**
- **100%** of fault data can be lost in a 24-hour WAN outage with naive storage
- Technicians dispatched without correct parts because the "black box" was overwritten
- Re-inspection costs run into tens of thousands per unnecessary site visit
- Undetected anomalies compound — small faults become catastrophic failures
- The problem is not storage size. It is storage **intelligence**.

**Speaker Notes:**
> "This is not a hypothetical. This is a structural gap in how industrial IoT handles offline periods. The industry has solved 'store more' — but nobody has solved 'store smarter.' That's what we built."

---

## SLIDE 3: INTRODUCING EDGEGUARD AI
### "Offline-First. Intelligence-Driven. Couchbase-Powered."

**Visual:** Clean logo — ShieldCheck icon with glow ring

**Headline:** EdgeGuard AI: An edge pipeline that knows what matters.

**Body:**
- **Ingests** live turbine telemetry from 3 turbines simultaneously
- **Scores** every reading with Isolation Forest ML — in under 1ms, no cloud required
- **Stores** data locally on Couchbase Edge Server
- **Compacts** routine data intelligently during outages — never touching fault data
- **Syncs** everything to central Couchbase Server the moment connectivity returns

**Speaker Notes:**
> "EdgeGuard AI doesn't just buffer data — it understands it. It knows the difference between a turbine running normally at 1450 kW and one about to fail at 110°C. And it makes sure the second one always survives."

---

## SLIDE 4: THE PIPELINE
### "7 Steps, One Resilient Chain"

**Visual:** Horizontal flow diagram
```
Simulator → Ingest → ML Score → Couchbase Edge → Compaction → Drain → Couchbase Central
```

**Body:**
1. **Simulate** — SCADA + vibration telemetry, 1 reading every 1.4 seconds per turbine
2. **Score** — Isolation Forest assigns anomaly score 0.0–1.0 in <1ms
3. **Persist** — Written immediately to Couchbase Edge Server (local SQLite-backed)
4. **Monitor** — Pressure policy watches 25-item edge capacity
5. **Compact** — Consecutive normals merged into CompactedBlocks when threshold hit (20 items)
6. **Protect** — Anomalies flagged as *Never Evict*, regardless of pressure
7. **Sync** — Drain loop pushes 5 items/600ms to central when online

**Speaker Notes:**
> "This is a deterministic pipeline. Every step is explicit. Every decision is logged. Judges can inspect the exact reason any reading was kept, compacted, or evicted."

---

## SLIDE 5: ML AT THE EDGE
### "Isolation Forest: Real AI, No Cloud"

**Visual:** Feature correlation diagram — wind speed → RPM → power → temperature

**Headline:** 5,000 training samples. 6 correlated signals. Inference in <1ms.

**Body:**
- **Algorithm:** Isolation Forest (scikit-learn) — unsupervised, no labelled fault data required
- **Features:** Vibration · Temperature · RPM · Power Output · Wind Speed · Blade Pitch
- **Physics-based training:** Wind speeds follow Weibull distribution; power follows cubic curve; blade pitch inverts at high wind — real turbine behaviour
- **Score → Label:** > 0.5 = `"anomaly"` (critical, protected) | ≤ 0.5 = `"normal"` (compressible)
- **Fault modes detected:** Overheating (110°C+) · Mechanical failure (vibration 6–15 mm/s) · Stall (0 RPM despite wind) · Power surge (2400–3500 kW)

**Speaker Notes:**
> "We chose Isolation Forest because it runs on CPU with no dependencies on a cloud API. Inference is a single matrix operation — under 1 millisecond per reading. And because it's trained on correlated physics data, it catches subtle combinations: low power plus high temperature at rated wind speed is an anomaly even if neither signal alone looks alarming."

---

## SLIDE 6: SMART COMPACTION
### "Compress the Noise. Preserve the Signal."

**Visual:** Before/After edge buffer diagram

**Headline:** 20 readings become 3 documents. Anomalies untouched.

**Before compaction (22 items):**
```
N N N A N N N N A N N N N N N N N N N N N N
```

**After compaction (5 items):**
```
CB(3) · A · CB(4) · A · CB(12)
```

**Body:**
- Compaction triggers at **20 items** (threshold), hard cap at **25**
- Consecutive normal readings merged into `CompactedBlock`: stores avg/min/max/stdDev
- **Anomalies break runs** — they are never merged, never part of a block
- Originals deleted from Edge Server *before* compacted block written (no replication race)
- Up to **85% reduction** in routine data volume during long outages
- Last resort: oldest normals evicted one-by-one — anomalies **never** evicted

**Speaker Notes:**
> "This is the key insight: not all data is equal. Routine operation readings from 2am on a calm day can be summarised as 'everything was fine.' But a gearbox overheat at 3am? That's evidence. EdgeGuard knows the difference and acts on it automatically."

---

## SLIDE 7: THE COUCHBASE STACK
### "Built for Exactly This"

**Visual:** Three-tier stack diagram

```
[Couchbase Edge Server]  ←── Local REST API  ←── FastAPI writes
        │
        │  Automatic replication
        ▼
[Sync Gateway]           ──── Bidirectional WebSocket sync
        │
        ▼
[Couchbase Server 7.6]   ──── Central analytics, full audit trail
```

**Body:**
- **Couchbase Edge Server:** SQLite-backed, REST API, offline-capable local store
- **Sync Gateway:** Handles backlog replication automatically on reconnect — zero application code
- **Couchbase Server:** Central `central.data` collection + `central.model_state` for ML metadata
- All Edge writes are **fire-and-forget** (never block the simulation loop)
- Sequence number persisted to Couchbase — survives server restarts

**Speaker Notes:**
> "We didn't bolt on a sync mechanism — we used Couchbase's native replication chain. The Edge Server writes locally. Sync Gateway queues the backlog. Couchbase Server receives it when the network allows. Application code only cares about writing to Edge — the rest is infrastructure."

---

## SLIDE 8: THE DASHBOARD
### "Mission Control for the Edge"

**Visual:** Screenshot of the React dashboard — dark cyberpunk UI

**Headline:** Real-time visibility into every byte at the edge.

**Body:**
- **React 19** + Tailwind CSS — mission control aesthetic, built for live demos
- **Zero polling:** Server-Sent Events (SSE) push every telemetry event, compaction, and sync in real time
- **Storage Pressure HUD:** Live bar — green → amber → red as edge fills
- **Compaction log:** Every merge event shown with sequence range (e.g. `[1001-1015] 2 blocks`)
- **Per-turbine controls:** Enable/disable, inject anomaly burst (8 readings), view history
- **Connection toggle:** Go offline/online with one click — demo the whole scenario live

**Speaker Notes:**
> "The UI isn't just decorative — every element reflects a real pipeline state. The pressure bar is directly tied to the in-memory edge buffer. The compaction log is firing from actual algorithm events. What you see is what's happening."

---

## SLIDE 9: LIVE DEMO
### "Watch It Survive"

**Visual:** Big slide — just the EdgeGuard logo + "LIVE DEMO" text

**Demo Script:**
1. **Normal flow** — 3 turbines running, data flowing edge → central, pressure near zero
2. **Inject anomaly** — Turbine 2: gearbox overheat. Watch ML flag it red instantly (score ~0.85)
3. **Go offline** — Toggle WAN off. Edge buffer fills. Storage pressure rises.
4. **Compaction fires** — Watch normal runs collapse to blocks. Anomalies preserved untouched.
5. **Come back online** — Toggle WAN on. Drain loop resumes. Central fills with all preserved data.

**Speaker Notes:**
> "We're going to simulate the scenario we described on slide one. Fault. Then blackout. Let's see if the evidence survives."

---

## SLIDE 10: WHAT WE BUILT
### "In One Hackathon"

**Visual:** Tech stack badge grid

**Body:**
| Component | Technology |
|---|---|
| Simulation Engine | Python AsyncIO |
| ML Anomaly Detector | scikit-learn Isolation Forest |
| Edge Persistence | Couchbase Edge Server |
| Cloud Sync | Couchbase Sync Gateway + Server |
| Backend API | Python FastAPI + SSE |
| Frontend | React 19 + Tailwind + Framer Motion |
| Containerisation | Docker + Polytope |

**Numbers:**
- **3** turbines simulated simultaneously
- **5,000** ML training samples with real physics
- **7** pipeline stages, all working end-to-end
- **<1ms** ML inference latency
- **100%** anomaly preservation guarantee

**Speaker Notes:**
> "Every service is containerised and running. The data contracts are defined for production scalability. This isn't a demo with hardcoded data — it's a functional prototype of a real industrial pipeline."

---

## SLIDE 11: IMPACT
### "Beyond These Three Turbines"

**Visual:** World map with offshore wind farms highlighted

**Body:**
- **Immediate:** Vattenfall and similar operators gain fault data even through extended outages
- **Operational ROI:** Fewer wasted maintenance helicopter dispatches — high-fidelity remote diagnostics
- **Predictive maintenance:** Preserved anomaly trails enable ML training on real fault progressions
- **Scalable architecture:** Same pattern applies to offshore oil rigs, remote mining, maritime fleets, satellite ground stations
- **Open interface:** `AnomalyDetector` is swappable — plug in an LSTM, an ensemble, or per-turbine models

**Speaker Notes:**
> "The ROI is clear and measurable. But the deeper value is the data foundation you build over time. Every preserved fault becomes a training example for the next generation model. EdgeGuard doesn't just solve today's problem — it builds the dataset that solves tomorrow's."

---

## SLIDE 12: CLOSE
### "Always Watching"

**Visual:** Single turbine silhouette against stars. Glow ring. ShieldCheck.

**Headline:** EdgeGuard AI

**Subheadline:** Offline-First. Intelligence-Driven. Couchbase-Powered.

**Tagline:**
> *"Because the most important data is the data you almost lost."*

**Footer:** Team EdgeGuard AI · Couchbase × Vattenfall Hackathon 2026

---

## APPENDIX: KEY METRICS CHEAT SHEET

| Metric | Value |
|---|---|
| Edge buffer capacity | 25 items |
| Compaction trigger | 20 items |
| Emit interval | 1400ms per turbine cycle |
| Drain rate (online) | 5 items / 600ms |
| ML training samples | 5,000 (physics-based) |
| ML features | 6 (vibration, temp, RPM, power, wind, pitch) |
| Anomaly threshold | score > 0.5 |
| Anomaly injection burst | 8 readings |
| Fault modes | 4 (overheat, mechanical, stall, power surge) |
| Max compaction reduction | ~85% routine data |
| Anomaly preservation | 100% — guaranteed |
