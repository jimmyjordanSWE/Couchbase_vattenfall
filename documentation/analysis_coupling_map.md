# Coupling Map

Date: 2026-03-09

## Backend

### High Coupling

- `services/python-fast-api/src/simulation.py`
  Central owner of:
  - timing loops
  - in-memory domain state
  - SSE event publication
  - compaction rules
  - edge/central persistence orchestration
  - anomaly burst semantics

This file is still the main gravity well.

- `services/python-fast-api/src/db.py`
  Still contains:
  - edge REST transport
  - central Couchbase access
  - pipeline state persistence
  - model state persistence

Even after adding `persistence/*`, this remains the underlying implementation bucket.

### Medium Coupling

- `services/python-fast-api/src/main.py`
  Couples startup to:
  - couchbase readiness
  - model loading
  - pipeline state hydration

- `services/python-fast-api/src/routes/stream.py`
  Couples snapshot semantics to backend runtime state and persisted state.

## Frontend

### High Coupling

- `services/react-web-app/app/stores/pipelineStore.ts`
  Holds:
  - domain state
  - packet animation state
  - UI transient state
  - reducers for SSE

- `services/react-web-app/app/components/pipeline/PipelineView.tsx`
  Couples:
  - pipeline scene rendering
  - turbine intent actions
  - packet motion
  - tank visualization
  - anomaly pending UX

### Medium Coupling

- `services/react-web-app/app/routes/demo.tsx`
  Couples:
  - initialization UX
  - top-level controls
  - API actions
  - scene lifecycle

- `services/react-web-app/app/hooks/useEventStream.ts`
  Couples backend event vocabulary to frontend reducers directly.

## Architectural Pressure Points

1. `simulation.py` is still too broad.
   Best next split:
   - `pipeline/engine.py`
   - `pipeline/events.py`
   - `pipeline/compaction.py`
   - `pipeline/state.py`

2. `PipelineView.tsx` is still too broad.
   Best next split:
   - `PipelineScene`
   - `PacketLayer`
   - `TurbineLayer`
   - `EdgeTank`
   - `CentralNode`

3. `pipelineStore.ts` still mixes domain and UI state.
   Best next split:
   - `pipelineDomainStore`
   - `pipelineUiStore`
   - `pipelineSelectors`

## Practical Meaning

The project is difficult to keep "correct" not because the stack is inherently complex, but because a few files still carry too many responsibilities.
When timing, transport, domain rules, and presentation all meet in one place, bugs feel random even when the underlying operations are individually simple.
