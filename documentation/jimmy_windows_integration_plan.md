# Jimmy Windows Integration Plan

## Goal

Integrate the `jimmy-windows` UI into the current `master` branch without replacing the existing backend architecture.

Working rule:

- Frontend source of truth: `jimmy-windows`
- Backend source of truth: current `master`
- Prefer adapting the UI to the backend contract
- Lift backend changes from `jimmy-windows` only when they are isolated improvements
- Extend backend only when the UI cannot reasonably adapt client-side

## Backend Contract To Preserve

Authoritative backend behavior on `master`:

- SSE stream is incremental plus an initial snapshot, not snapshot-only
- Snapshot shape from `GET /api/stream/events`:
  - `edgeStorage`
  - `centralStorage`
  - `metrics`
  - `systemStatus`
  - `compactionLogs`
  - `compactionCount`
- System endpoints:
  - `GET /api/system/config`
  - `GET /api/system/status`
  - `POST /api/system/initialize`
  - `POST /api/system/start`
  - `POST /api/system/stop`
- Connection endpoint:
  - `POST /api/connection`
- Storage endpoints already exist on `master` and should remain usable:
  - edge list/clear
  - central list
  - global clear
- Current backend semantics to preserve unless there is a deliberate extension:
  - enabled turbine support
  - incremental telemetry / edge_update / central_update / compaction / metrics / system_status events
  - existing Couchbase edge/central storage flow

## Integration Strategy

1. Keep `master` backend semantics intact.
2. Bring over the `jimmy-windows` visual UI.
3. Replace the `jimmy-windows` frontend data layer with an adapter that speaks the `master` backend contract.
4. Add backend extensions only for UI features that cannot be derived client-side.
5. Lift safe backend implementation improvements later, after the integrated UI is stable.

## File Classification

### Frontend: Take From `jimmy-windows`

These are primarily visual or structural UI files. They should be ported, then re-wired to the `master` backend contract where needed.

- `services/react-web-app/app/app.css`
- `services/react-web-app/app/routes/demo.tsx`
- `services/react-web-app/app/components/dashboard/HeaderBar.tsx`
- `services/react-web-app/app/components/dashboard/TurbineCard.tsx`
- `services/react-web-app/app/components/dashboard/StoragePanel.tsx`
- `services/react-web-app/app/components/dashboard/DataTables.tsx`
- `services/react-web-app/app/components/dashboard/ConnectionToggle.tsx`
- `services/react-web-app/app/components/pipeline/PipelineView.tsx`
- `services/react-web-app/app/components/pipeline/PipelineAuditTicker.tsx`
- `services/react-web-app/app/routes/home.tsx`
- `services/react-web-app/public/vattenfall-logo-grey.svg`

Notes:

- These files can move over visually, but they must stop assuming snapshot-only backend behavior.
- `demo.tsx` and `ConnectionToggle.tsx` are not pure view files; they will need API adaptation.

### Frontend: Manual Reconcile / Adapter Required

These files are where the UI/backend contract is enforced. They should not be copied from `jimmy-windows` verbatim.

- `services/react-web-app/app/lib/api.ts`
- `services/react-web-app/app/hooks/useEventStream.ts`
- `services/react-web-app/app/stores/pipelineStore.ts`

Target state:

- keep `master` API compatibility
- expose selectors and normalized state the `jimmy-windows` UI wants
- support both:
  - incremental SSE events from `master`
  - initial snapshot from `master`

### Frontend: Keep From `master`

- `services/react-web-app/app/hooks/usePipelineLoop.ts`

Reason:

- `jimmy-windows` deleted it because that branch moved to snapshot-only updates.
- `master` still uses packet transit animation and incremental stream handling.
- Keep it until the new adapter layer proves it is unnecessary.

### Backend: Keep From `master`

These files define the current backend contract and should remain authoritative for the first integration pass.

- `services/python-fast-api/src/main.py`
- `services/python-fast-api/src/routes/storage.py`
- `services/python-fast-api/src/routes/turbines.py`
- `services/python-fast-api/src/routes/metrics.py`
- `services/python-fast-api/src/routes/model.py`
- `services/python-fast-api/src/routes/stream.py`
- `services/python-fast-api/src/routes/system.py`
- `services/python-fast-api/src/routes/connection.py`
- `services/python-fast-api/src/simulation.py`
- `services/python-fast-api/src/models/edgeguard.py`
- `services/python-fast-api/src/db.py`
- `services/sync-gateway/database.json`
- `services/couchbase-edge-server/config.json`
- `config/couchbase-server/couchbase.yaml`

Reason:

- These carry the existing backend semantics, storage model, and replication assumptions.
- They can be extended later, but the integration should not start by replacing them.

### Backend: Candidate Improvements To Lift From `jimmy-windows`

These should be evaluated after the UI integration is functioning on top of the `master` contract.

- `services/python-fast-api/src/compaction_policy.py`
  - good extraction candidate if it can be introduced without changing behavior
- `services/python-fast-api/src/db.py`
  - clear-database helper patterns are worth reviewing
- `services/python-fast-api/src/routes/system.py`
  - `clear-database` may be a useful additive endpoint
- `services/python-fast-api/src/routes/connection.py`
  - mesh gateway is only a candidate if the UI truly needs it and it fits current backend semantics
- `services/sync-gateway/entrypoint.sh`
- `services/couchbase-edge-server/entrypoint.sh`

Rule:

- implementation improvement: consider lifting
- semantic/runtime model change: defer unless needed

### Backend: Do Not Take Blindly From `jimmy-windows`

- snapshot-only backend contract
- `PipelineSnapshot` as the primary backend model
- simulation timing changes (`140ms`/`120ms`)
- edge capacity / threshold changes (`100`/`80`)
- mesh gateway runtime semantics
- central history/capacity semantics introduced only for UI display

Reason:

- These are not clean improvements; they change core behavior.

## Required Adapter Work

### API Adapter

`services/react-web-app/app/lib/api.ts`

Need to support `master` endpoints while still providing helpers the `jimmy-windows` UI expects.

Plan:

- keep existing `master` endpoint typings
- add frontend-only normalized helper types where useful
- do not switch the app to require:
  - `GET /api/system/snapshot`
  - `POST /api/system/clear-database`
  - `POST /api/mesh-gateway`
  unless those endpoints are added deliberately

### Event Stream Adapter

`services/react-web-app/app/hooks/useEventStream.ts`

Target behavior:

- subscribe to `master` SSE stream
- accept initial `snapshot`
- continue handling:
  - `telemetry`
  - `edge_update`
  - `central_update`
  - `compaction`
  - `metrics`
  - `system_status`
- hydrate the richer `jimmy-windows` UI state from those incremental events

### Store Adapter

`services/react-web-app/app/stores/pipelineStore.ts`

Target behavior:

- keep enough `master` state to support existing incremental animation logic
- expose richer selectors for the `jimmy-windows` UI
- derive UI fields when the backend does not provide them directly

Examples of client-derived fields:

- high-level UI state (`boot`, `idle`, `running`)
- storage cards and status badges
- “can clear”, “can start”, “can stop” selectors

Fields that should not become required backend dependencies in pass one:

- `centralCapacity`
- `isRecoverySyncActive`
- `isMeshGatewayActive`
- snapshot-only `config/status/metrics` envelope

## Likely Backend Extensions

These are acceptable only if the `jimmy-windows` UI genuinely needs them and client adaptation is awkward.

### Good additive extensions

- `POST /api/system/clear-database` if current storage clear endpoints are too fragmented for the UI
- a normalized `GET /api/system/snapshot` endpoint if it simplifies first-load hydration without changing stream semantics
- additional status fields if they represent real backend state already being tracked

### Extensions to defer

- mesh gateway mode
- snapshot-only SSE stream
- new simulation speeds or capacities
- broad storage schema changes

## Execution Order

### Pass 1: Integration skeleton

- classify all touched files
- port visual assets and CSS from `jimmy-windows`
- keep `master` backend untouched

### Pass 2: Data-layer reconciliation

- rewrite `api.ts`
- rewrite `useEventStream.ts`
- rewrite `pipelineStore.ts`
- keep `master` stream semantics

### Pass 3: Dashboard port

- port `demo.tsx`
- port dashboard and pipeline components
- remove backend assumptions that do not exist on `master`

### Pass 4: Additive backend support

- add only the minimal backend extensions needed by the UI
- prefer reusing existing storage clear and status endpoints

### Pass 5: Safe backend lift-ins

- evaluate `compaction_policy.py`
- evaluate clear-database helper code
- evaluate logging and entrypoint improvements

### Pass 6: Verification

- initialize/start/stop
- turbine enable/disable
- anomaly injection and clear
- online/offline behavior
- edge buffer growth
- compaction behavior
- central storage visibility
- full dashboard render and live update behavior

## Immediate Next Steps

1. Rework the frontend data layer to target the `master` backend contract.
2. Port the `jimmy-windows` UI shell and dashboard layout.
3. Reconnect each UI control to existing backend endpoints.
4. Add only the missing backend support that cannot be handled in the adapter layer.
