# Couchbase Vattenfall Hackathon Pipeline

Im thinking we start with a simple pipeline where the data just passes through each module.
Then its easy have simulator at one end, couchbase at the other, and the ingest and ML module in between

## Structure

- `pipeline/01-simulator` real-time synthetic turbine data generator
- `pipeline/02-edge-app` TypeScript ingest + persistence service
- `pipeline/pipeline.config.json` ordered module config
- `pipeline/launcher.mjs` pipeline process orchestrator
- `utilities/pipeline_logger.mjs` shared JSONL logging utility
- `logs/pipeline.jsonl` unified pipeline event log output
- `documentation/` design and implementation docs

## Quick Start (Short)

1. Start Docker Desktop.
2. Start Couchbase container set up port forwarding, and open `http://127.0.0.1:18091`.
3. Finish Couchbase setup ("Administrator/vattenfall" credentials match current config settings).
4. From repo root, run:
   - `.\start_pipeline.ps1`
5. Stop with `Ctrl+C`.

## First-Time Setup

1. Ensure local Couchbase is running and bucket `edge_events` exists.
2. Set up edge app env:
   - Copy `pipeline/02-edge-app/.env.example` to `pipeline/02-edge-app/.env`
3. Install edge app dependencies:
   - `cd pipeline/02-edge-app`
   - `npm.cmd install`
4. From repo root, start pipeline:
   - `./pipeline-launcher.ps1`

The launcher starts modules in configured order from `pipeline/pipeline.config.json`.
`start_pipeline.ps1` builds and starts the pipeline. Bucket selection/creation is automatic inside edge-app startup.

## Stop

Press `Ctrl+C` in the launcher terminal.

## Notes

- Simulator default cadence is 500 ms.
- Simulator publishes to edge ingest endpoint via HTTP.
- All design docs are under `documentation/`.
