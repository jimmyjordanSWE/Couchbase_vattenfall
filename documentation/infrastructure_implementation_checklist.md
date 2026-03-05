# Infrastructure Implementation Checklist (MVP)

## 0. Environment Baseline

- [ ] Docker Desktop running
- [ ] Couchbase container running and reachable at `http://127.0.0.1:18091`
- [ ] Couchbase cluster initialized
- [ ] Bucket created: `edge_events`
- [ ] Credentials confirmed (store in `.env`, not source code)

## 1. Repository Setup

- [ ] Create project structure:
  - [ ] `apps/edge-app`
  - [ ] `apps/simulator`
  - [ ] `docs/`
- [ ] Initialize Node + TypeScript in `apps/edge-app`
- [ ] Add dependencies:
  - [ ] `fastify`
  - [ ] `couchbase`
  - [ ] `zod` (or equivalent lightweight validation)
  - [ ] `dotenv`
- [ ] Add scripts:
  - [ ] `dev`
  - [ ] `build`
  - [ ] `start`

## 2. Configuration and Secrets

- [ ] Create `.env` for edge app:
  - [ ] `PORT=3000`
  - [ ] `CB_CONN_STR=couchbase://127.0.0.1`
  - [ ] `CB_USERNAME=Administrator`
  - [ ] `CB_PASSWORD=...`
  - [ ] `CB_BUCKET=edge_events`
  - [ ] `PRESSURE_HIGH_PCT=80`
  - [ ] `PRESSURE_LOW_PCT=65`
  - [ ] `SYNC_ENABLED=true`
- [ ] Add `.env.example`
- [ ] Add `.gitignore` entry for `.env`

## 3. Couchbase Data Layout

- [ ] Create collections (or use `_default` first for speed)
- [ ] Define document keys:
  - [ ] `event::<device_id>::<seq>`
  - [ ] `manifest::<device_id>`
  - [ ] `prune_batch::<device_id>::<timestamp>::<from_seq>`
- [ ] Create minimal indexes for demo queries

## 4. Edge API Service (Fastify)

- [ ] Health endpoint: `GET /health`
- [ ] Status endpoint: `GET /status`
- [ ] Ingest endpoint: `POST /ingest`
- [ ] Validation for ingest essentials:
  - [ ] `device_id`
  - [ ] `seq`
  - [ ] `ts`
  - [ ] `signals`
- [ ] Ack response format:
  - [ ] `accepted`
  - [ ] `rejected`
  - [ ] `last_seq`

## 5. Black-Box Inference Module

- [ ] Implement inference adapter function
- [ ] Attach:
  - [ ] `risk_score`
  - [ ] `risk_class`
- [ ] Deterministic behavior for demo scenarios

## 6. Persistence Flow

- [ ] Write enriched `event` docs to Couchbase
- [ ] Upsert `manifest` per device:
  - [ ] `last_seen_seq`
  - [ ] `last_stored_seq`
  - [ ] `last_synced_seq`
- [ ] Add basic error handling and logging

## 7. Pressure Worker

- [ ] Periodic job (e.g., every 5-10s)
- [ ] Read storage/collection pressure metric
- [ ] If `> PRESSURE_HIGH_PCT`, prune batches
- [ ] Stop when `< PRESSURE_LOW_PCT`
- [ ] Never prune `critical`
- [ ] Record one `prune_batch` doc per prune cycle

## 8. Sync Worker

- [ ] Online/offline toggle (`POST /control/network`)
- [ ] Periodic sync job when online
- [ ] Read unsynced range from `manifest`
- [ ] Send chunk to central endpoint
- [ ] Advance `last_synced_seq` only on success

## 9. Central Mock Endpoint

- [ ] Implement `POST /central/upload` (in same app for MVP)
- [ ] Deduplicate by `device_id + seq`
- [ ] Return upload ack

## 10. Simulator Process

- [ ] Generate 1 Hz telemetry per device
- [ ] Maintain monotonic sequence
- [ ] Support fault mode toggle
- [ ] Send batched HTTP to `POST /ingest`
- [ ] Retry with simple backoff

## 11. Demo Observability

- [ ] `GET /status/ingest`
- [ ] `GET /status/pressure`
- [ ] `GET /status/sync`
- [ ] `GET /events/recent`
- [ ] `GET /prune-batches/recent`
- [ ] Optional: `GET /explain/event/{device_id}/{seq}`

## 12. Verification Checklist

- [ ] Ingest accepts valid payloads
- [ ] Invalid payloads return clean errors
- [ ] Event docs visible in Couchbase
- [ ] Manifest updates correctly with sequence
- [ ] Pressure worker prunes only eligible docs
- [ ] Critical events remain after prune
- [ ] Sync catches up after offline -> online

## 13. Demo-Day Runbook

- [ ] Start Couchbase and verify UI login
- [ ] Start edge app and confirm `/health`
- [ ] Start simulator and confirm ingest rate
- [ ] Trigger offline mode and show backlog growth
- [ ] Trigger pressure policy and show prune batches
- [ ] Return online and show sync recovery

## 14. Stretch Goals (Only if time remains)

- [ ] Replace black-box inference with real Isolation Forest
- [ ] Add mesh offload branch
- [ ] Add React dashboard for live charts
- [ ] Add trace endpoint per event
