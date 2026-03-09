# Runtime Hotspots

Date: 2026-03-09
Scope: `services/python-fast-api/src`, `services/react-web-app/app`
Method: static scan of loops, timers, queueing, render-sensitive state, and cross-layer update paths. `tree-sitter` CLI was not available in this environment, so this report uses direct source analysis and targeted pattern scans.

## Top Findings

1. The project is not primarily slow because of Python or Couchbase.
   The dominant costs are state churn, UI animation coupling, and deliberately slow business timing.

2. `Inject Anomaly` is inherently delayed by backend design.
   In `services/python-fast-api/src/simulation.py`, anomaly injection only changes the next generated reading burst.
   The emit loop runs every `1400ms`.
   Result: user-visible latency is often one full emit interval before the first anomaly packet exists.

3. The frontend pipeline scene is still the hottest render surface.
   `services/react-web-app/app/components/pipeline/PipelineView.tsx`
   Reasons:
   - subscribes directly to `edgeStorage`, `centralStorage`, `packetsInTransit`, `isOnline`, `isRunning`, `enabledTurbines`, `compactionCount`, `edgePressure`
   - renders the largest SVG scene
   - maps `packetsInTransit` into multiple `motion.circle` elements per packet
   - recomputes tank/anomaly marker derivations from full `edgeStorage`

4. The backend still has two permanent loops.
   `services/python-fast-api/src/simulation.py`
   - `_emit_loop`
   - `_drain_loop`
   These are not individually expensive, but they are the timing source for nearly all visible behavior.

5. SSE fanout is cheap at this scale, but it amplifies bad event granularity.
   `services/python-fast-api/src/simulation.py`
   - one queue per subscriber
   - every state change becomes multiple events
   If event payloads are noisy or redundant, the frontend pays that cost repeatedly.

## Concrete Hot Paths

### Backend

- `SimulationEngine._emit_loop`
  File: `services/python-fast-api/src/simulation.py`
  Why hot:
  - runs forever
  - publishes telemetry
  - mutates edge buffer
  - may compact
  - schedules persistence writes

- `SimulationEngine._drain_loop`
  File: `services/python-fast-api/src/simulation.py`
  Why hot:
  - runs forever
  - may compact when reconnecting
  - drains up to `DRAIN_BATCH_SIZE`
  - publishes central updates

- `_publish`
  File: `services/python-fast-api/src/simulation.py`
  Why hot:
  - every SSE event goes through it
  - queue pressure or redundant payloads multiply frontend work

### Frontend

- `PipelineView`
  File: `services/react-web-app/app/components/pipeline/PipelineView.tsx`
  Why hot:
  - largest reactive component
  - many store subscriptions
  - packet animation layer plus full scene rerender triggers

- `pipelineStore`
  File: `services/react-web-app/app/stores/pipelineStore.ts`
  Why hot:
  - central reducer for edge, central, metrics, snapshot, packet animation state
  - arrays are replaced often
  - multiple components subscribe directly to raw storage arrays

- `useEventStream`
  File: `services/react-web-app/app/hooks/useEventStream.ts`
  Why hot:
  - all live updates enter here
  - if backend event shape is noisy, this amplifies frontend churn

## Why It Feels Slow

### `Inject Anomaly`

- User clicks button
- frontend sends request immediately
- backend sets `forced_anomaly_turbine`
- anomaly does not exist until next emit cycle
- emit cycle interval is `1400ms`

This is perceived as lag even if the request itself is fast.

### Fans / turbine spin

Fan spin is tied to `isRunning && enabled`.
If the UI or backend snapshot already says turbines are enabled/running, the scene starts active immediately.
This is not CPU latency; it is state semantics.

### Packet travel

Packet travel feels wrong when:
- the packet is created late
- the route is visually compressed
- animation begins only after backend event creation, not at user intent time

## Short-Term Performance Priorities

1. Reduce anomaly-feedback latency:
   add immediate local intent feedback on click and/or shorten emit interval.

2. Reduce `PipelineView` subscriptions:
   move tank derivation and packet derivation into selectors or child components with narrower inputs.

3. Collapse event noise:
   prefer one authoritative state mutation event per logical action, not multiple loosely related ones.

4. Make timing explicit:
   if `1400ms` is for demo readability, accept the delay as product behavior; otherwise lower it.
