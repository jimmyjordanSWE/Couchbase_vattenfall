import Fastify from "fastify";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { inferRisk } from "./inference.js";
import { getRecentEvents, saveEvent } from "./repository.js";
import { normalizeBody, validateEvent } from "./validation.js";

async function main() {
  const app = Fastify({ logger: false });
  const db = await connectDb();
  console.log(`edge-app connected bucket: ${db.bucketName}`);

  const metrics = {
    accepted: 0,
    rejected: 0,
    stored: 0,
    startedAt: new Date().toISOString(),
    lastEventTs: "",
  };

  app.get("/health", async () => ({ ok: true }));

  app.get("/status", async () => ({
    ok: true,
    bucket: db.bucketName,
    started_at: metrics.startedAt,
    accepted: metrics.accepted,
    rejected: metrics.rejected,
    stored: metrics.stored,
    last_event_ts: metrics.lastEventTs,
  }));

  app.get("/events/recent", async (request) => {
    const limit = Number((request.query as { limit?: string }).limit ?? 25);
    const rows = await getRecentEvents(db.cluster, db.bucketName, Number.isFinite(limit) ? limit : 25);
    return { count: rows.length, events: rows };
  });

  app.post("/ingest", async (request, reply) => {
    const events = normalizeBody(request.body);
    if (events.length === 0) {
      return reply.code(400).send({ accepted: 0, rejected: 0, last_seq: null, error: "No events in request" });
    }

    let accepted = 0;
    let rejected = 0;
    let lastSeq: number | null = null;
    const errors: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < events.length; i += 1) {
      const validated = validateEvent(events[i]);
      if (!validated.ok) {
        rejected += 1;
        metrics.rejected += 1;
        errors.push({ index: i, reason: validated.reason });
        continue;
      }

      const event = validated.value;
      event.inference = inferRisk(event);
      event.storage = { stored_at: new Date().toISOString() };

      await saveEvent(db.collection, event);

      accepted += 1;
      metrics.accepted += 1;
      metrics.stored += 1;
      metrics.lastEventTs = event.meta.ts;
      lastSeq = event.meta.seq;
    }

    return {
      accepted,
      rejected,
      last_seq: lastSeq,
      errors,
    };
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
