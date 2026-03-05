import { Cluster, Collection, GetResult } from "couchbase";
import { EventDoc, EventEnvelope, ManifestDoc } from "./types.js";

function eventKey(deviceId: string, sourceId: string, seq: number): string {
  return `event::${deviceId}::${sourceId}::${seq}`;
}

function manifestKey(deviceId: string, sourceId: string): string {
  return `manifest::${deviceId}::${sourceId}`;
}

export async function saveEvent(collection: Collection, envelope: EventEnvelope): Promise<void> {
  const deviceId = envelope.meta.device_id;
  const sourceId = envelope.meta.source_id;
  const seq = envelope.meta.seq;

  const doc: EventDoc = {
    type: "event",
    ...envelope,
    priority: envelope.inference?.risk_class === "critical" ? "high" : envelope.inference?.risk_class === "warning" ? "medium" : "low",
  };

  await collection.upsert(eventKey(deviceId, sourceId, seq), doc);
  await upsertManifest(collection, deviceId, sourceId, seq);
}

async function upsertManifest(collection: Collection, deviceId: string, sourceId: string, seq: number): Promise<void> {
  const key = manifestKey(deviceId, sourceId);

  let existing: ManifestDoc | null = null;
  try {
    const res: GetResult = await collection.get(key);
    existing = res.content as ManifestDoc;
  } catch {
    existing = null;
  }

  const doc: ManifestDoc = {
    type: "manifest",
    device_id: deviceId,
    source_id: sourceId,
    last_seen_seq: seq,
    last_stored_seq: seq,
    last_synced_seq: existing?.last_synced_seq ?? 0,
    updated_at: new Date().toISOString(),
  };

  await collection.upsert(key, doc);
}

export async function getRecentEvents(cluster: Cluster, bucketName: string, limit = 25): Promise<unknown[]> {
  const q = `
    SELECT d.*
    FROM \`${bucketName}\`._default._default AS d
    WHERE d.type = "event"
    ORDER BY STR_TO_MILLIS(d.meta.ts) DESC
    LIMIT $limit;
  `;

  const result = await cluster.query(q, { parameters: { limit } });
  return result.rows;
}
