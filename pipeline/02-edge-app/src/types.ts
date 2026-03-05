export type RiskClass = "normal" | "warning" | "critical";

export interface EventEnvelope {
  meta: {
    schema_version?: string;
    trace_id?: string;
    device_id: string;
    source_id: string;
    source_type?: string;
    seq: number;
    ts: string;
  };
  raw_payload: Record<string, unknown>;
  tags?: Record<string, unknown>;
  features?: Record<string, unknown>;
  inference?: {
    risk_score: number;
    risk_class: RiskClass;
    model_id: string;
  };
  storage?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}

export interface IngestBody {
  events?: EventEnvelope[];
}

export interface ManifestDoc {
  type: "manifest";
  device_id: string;
  source_id: string;
  last_seen_seq: number;
  last_stored_seq: number;
  last_synced_seq: number;
  updated_at: string;
}

export interface EventDoc extends EventEnvelope {
  type: "event";
  priority: "low" | "medium" | "high";
}
