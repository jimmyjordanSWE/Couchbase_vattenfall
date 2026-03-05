# Pipeline Launcher

This folder defines ordered startup for the MVP pipeline.

## Structure

- `01-simulator/` data generator module
- `02-edge-app/` ingest + persistence API module
- `pipeline.config.json` ordered module config
- `launcher.mjs` starts modules in declared order

## How it works

1. Launcher reads `pipeline.config.json`
2. Starts each enabled module in listed order
3. Applies `start_delay_ms` before starting next module
4. Prefixes each process output with module id

## Run

From this `pipeline/` directory:

```bash
node launcher.mjs
```

Stop with `Ctrl+C`.

## Notes

- Install dependencies in `02-edge-app` before first run:
  - `cd 02-edge-app`
  - `npm.cmd install`
- Simulator posts directly to edge app via `--ingest-url` from config.
