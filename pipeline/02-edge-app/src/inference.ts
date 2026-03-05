import { EventEnvelope, RiskClass } from "./types.js";

export function inferRisk(event: EventEnvelope): EventEnvelope["inference"] {
  const src = event.meta.source_type ?? "unknown";
  const payload = event.raw_payload as Record<string, number | string | undefined>;

  // Hackathon black-box stub: deterministic scoring from obvious signals.
  let score = 0.2;
  if (src === "vibration_cms") {
    const rms = Number(payload.vibration_rms_mm_s ?? 0);
    score += rms > 4 ? 0.7 : rms > 2.5 ? 0.35 : 0.1;
  }
  if (src === "scada") {
    const temp = Number(payload.ambient_temp_c ?? 0);
    score += temp > 24 ? 0.6 : temp > 18 ? 0.25 : 0.1;
  }

  let riskClass: RiskClass = "normal";
  if (score >= 0.85) riskClass = "critical";
  else if (score >= 0.45) riskClass = "warning";

  return {
    risk_score: Number(score.toFixed(3)),
    risk_class: riskClass,
    model_id: "stub-v1",
  };
}
