# Edge App (MVP)

Minimal runtime backend for the hackathon pipeline.

## Endpoints

- `GET /health`
- `GET /status`
- `GET /events/recent?limit=25`
- `POST /ingest`

## Request shape (`POST /ingest`)

Accepts either:

- a single envelope object, or
- `{ "events": [ ... ] }`

Required fields per event:

- `meta.device_id`
- `meta.source_id`
- `meta.seq`
- `meta.ts`
- `raw_payload`

## Run

1. Copy env:

```bash
cp .env.example .env
```

2. Install deps:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

Server default: `http://localhost:3000`

## Simulator integration

Use the pipeline launcher from `../`:

```bash
cd ..
node launcher.mjs
```

The simulator is configured to publish directly to `http://127.0.0.1:3000/ingest`.
