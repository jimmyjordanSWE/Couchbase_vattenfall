import { EventEnvelope } from "./types.js";

function hasString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateEvent(event: unknown): { ok: true; value: EventEnvelope } | { ok: false; reason: string } {
  if (!event || typeof event !== "object") return { ok: false, reason: "event must be object" };

  const e = event as Record<string, unknown>;
  const meta = e.meta as Record<string, unknown> | undefined;

  if (!meta || typeof meta !== "object") return { ok: false, reason: "meta missing" };
  if (!hasString(meta.device_id)) return { ok: false, reason: "meta.device_id missing" };
  if (!hasString(meta.source_id)) return { ok: false, reason: "meta.source_id missing" };
  if (typeof meta.seq !== "number" || !Number.isFinite(meta.seq)) return { ok: false, reason: "meta.seq invalid" };
  if (!hasString(meta.ts)) return { ok: false, reason: "meta.ts missing" };

  const raw = e.raw_payload;
  if (!raw || typeof raw !== "object") return { ok: false, reason: "raw_payload missing" };

  return { ok: true, value: e as unknown as EventEnvelope };
}

export function normalizeBody(body: unknown): unknown[] {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null) {
    const b = body as { events?: unknown[] };
    if (Array.isArray(b.events)) return b.events;
    return [body];
  }
  return [];
}
