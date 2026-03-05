#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Minimal wind turbine multi-source data generator for hackathon MVP.
 *
 * Emits newline-delimited JSON events with per-stream identity:
 * (device_id, source_id, seq).
 *
 * Options (all optional):
 *   --realtime <true|false>            Default: true
 *   --cadence-ms <number>              Default: 500
 *   --duration-sec <number>            Default: 0 (run forever)
 *   --turbines <number>                Default: 1
 *   --seed <number>                    Default: 42
 *   --fault-mode <mode>                Default: mixed
 *                                      Modes: none|gearbox_overheat|overheat|imbalance|stuck|mixed
 *                                      Aliases: gearbox|broken_gearbox -> gearbox_overheat
 *   --fault-start-sec <number>         Default: -1 (disabled)
 *   --fault-duration-sec <number>      Default: -1 (disabled)
 *   --fault-intensity <number>         Default: 1
 *   --vibration-multiplier <number>    Default: 1
 *   --start-ts <ISO timestamp>         Default: now
 *   --out <path>                       Default: none
 *   --ingest-url <http url>            Default: none (no HTTP publish)
 *   --console-mode <raw|stats|silent>  Default: stats
 *
 * Output behavior:
 *   - Always writes events to console (stdout)
 *   - If --out is set, also writes the same events to file (tee mode)
 *   - If --ingest-url is set, posts events to edge ingest API
 */

const fs = require("fs");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith("--")) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function toNum(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function mkRng(seed) {
  // LCG for deterministic repeatability.
  let s = (seed >>> 0) || 1;
  return function rand() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function gauss(rand) {
  // Box-Muller transform.
  const u1 = Math.max(rand(), 1e-12);
  const u2 = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function buildFaultPlan(totalSteps, mode) {
  if (mode === "none" || totalSteps < 40) return [];
  const p1 = Math.floor(totalSteps * 0.35);
  const p2 = Math.floor(totalSteps * 0.55);
  const p3 = Math.floor(totalSteps * 0.7);
  const p4 = Math.floor(totalSteps * 0.9);

  if (mode === "overheat") {
    return [{ type: "gearbox_overheat", start: p1, end: p3 }];
  }
  if (mode === "imbalance") {
    return [{ type: "rotor_imbalance", start: p2, end: p4 }];
  }
  if (mode === "stuck") {
    return [{ type: "sensor_stuck", start: p1, end: p2 }];
  }
  // mixed
  return [
    { type: "gearbox_overheat", start: p1, end: p2 },
    { type: "rotor_imbalance", start: p2 + 5, end: p3 + 20 },
    { type: "sensor_stuck", start: p3 + 25, end: p4 },
    { type: "curtailment", start: Math.max(5, p1 - 15), end: p1 - 5 },
  ];
}

function activeFault(step, plan) {
  return plan.find((f) => step >= f.start && step <= f.end) || null;
}

function normalizeFaultMode(mode) {
  if (mode === "gearbox") return "gearbox_overheat";
  if (mode === "broken_gearbox") return "gearbox_overheat";
  return mode;
}

function activeFaultRealtime(step, mode) {
  mode = normalizeFaultMode(mode);
  if (mode === "none") return null;
  if (mode === "gearbox_overheat") return step % 300 >= 90 && step % 300 <= 170 ? { type: "gearbox_overheat" } : null;
  const cycle = step % 300;
  if (mode === "overheat") return cycle >= 90 && cycle <= 170 ? { type: "gearbox_overheat" } : null;
  if (mode === "imbalance") return cycle >= 140 && cycle <= 240 ? { type: "rotor_imbalance" } : null;
  if (mode === "stuck") return cycle >= 80 && cycle <= 130 ? { type: "sensor_stuck" } : null;
  // mixed
  if (cycle >= 40 && cycle <= 70) return { type: "curtailment" };
  if (cycle >= 90 && cycle <= 140) return { type: "gearbox_overheat" };
  if (cycle >= 160 && cycle <= 230) return { type: "rotor_imbalance" };
  if (cycle >= 245 && cycle <= 280) return { type: "sensor_stuck" };
  return null;
}

function scadaSignals(t, rand, turbineIdx, fault, intensity) {
  const profile = 1 + turbineIdx * 0.03;
  let wind = 10 + 2.2 * Math.sin(t / 90) + 0.4 * gauss(rand);
  wind = clamp(wind * profile, 3, 22);

  let rotor = 900 + 95 * wind + 6 * gauss(rand);
  rotor = clamp(rotor / 10, 6, 22); // simplified rpm-ish scale for demo

  let pitch = clamp(8 + 2.5 * Math.sin(t / 120) + 0.2 * gauss(rand), 2, 22);
  let power = clamp(80 * Math.pow(wind, 1.5) + 12 * gauss(rand), 0, 3500);
  let ambient = 12 + 4 * Math.sin(t / 500) + 0.3 * gauss(rand);

  let statusCode = 0;
  if (fault && fault.type === "gearbox_overheat") {
    ambient += (6 + (t % 30) * 0.1) * intensity;
    power *= clamp(0.92 - 0.02 * (intensity - 1), 0.75, 0.96);
    statusCode = 3101;
  } else if (fault && fault.type === "rotor_imbalance") {
    rotor += 1.2 * intensity * Math.sin(t / 2);
    power += 40 * intensity * Math.sin(t / 3);
    statusCode = 3205;
  } else if (fault && fault.type === "sensor_stuck") {
    wind = 9.5;
    statusCode = 3302;
  } else if (fault && fault.type === "curtailment") {
    power *= 0.55;
    rotor *= 0.7;
    statusCode = 2100;
  }

  return {
    wind_speed_m_s: Number(wind.toFixed(3)),
    wind_direction_deg: Number((180 + 25 * Math.sin(t / 200) + 3 * gauss(rand)).toFixed(3)),
    power_kw: Number(power.toFixed(3)),
    rotor_speed_rpm: Number(rotor.toFixed(3)),
    pitch_deg: Number(pitch.toFixed(3)),
    ambient_temp_c: Number(ambient.toFixed(3)),
    status_code: statusCode,
  };
}

function vibrationSignals(t, rand, scada, fault, intensity, vibrationMultiplier) {
  let rms = 1.4 + 0.001 * scada.rotor_speed_rpm + 0.08 * gauss(rand);
  let kurt = 3.0 + 0.15 * gauss(rand);
  let crest = 3.1 + 0.25 * gauss(rand);
  let band = 5.0 + 0.5 * Math.abs(Math.sin(t / 9)) + 0.2 * gauss(rand);

  if (fault && fault.type === "gearbox_overheat") {
    rms += intensity * (0.8 + 0.01 * (t % 60));
    kurt += 0.5 * intensity;
    band += 1.1 * intensity;
  } else if (fault && fault.type === "rotor_imbalance") {
    rms += 0.9 * intensity * Math.abs(Math.sin(t / 2));
    kurt += 0.8 * intensity * Math.abs(Math.sin(t / 4));
    crest += 0.6 * intensity;
    band += 0.7 * intensity * Math.abs(Math.sin(t / 3));
  } else if (fault && fault.type === "sensor_stuck") {
    rms = 2.05;
    kurt = 2.9;
    crest = 3.0;
    band = 5.1;
  }

  rms *= vibrationMultiplier;
  kurt *= clamp(1 + (vibrationMultiplier - 1) * 0.25, 0.7, 2);
  crest *= clamp(1 + (vibrationMultiplier - 1) * 0.2, 0.7, 2);
  band *= clamp(1 + (vibrationMultiplier - 1) * 0.35, 0.7, 3);

  return {
    vibration_rms_mm_s: Number(rms.toFixed(4)),
    vibration_kurtosis: Number(kurt.toFixed(4)),
    crest_factor: Number(crest.toFixed(4)),
    band_energy_hz_1_10: Number(band.toFixed(4)),
  };
}

function alarmEvent(t, fault) {
  if (!fault) return null;
  if (t % 10 !== 0) return null;
  const map = {
    gearbox_overheat: { severity: "high", code: "GBX_OVERHEAT" },
    rotor_imbalance: { severity: "medium", code: "ROTOR_IMBALANCE" },
    sensor_stuck: { severity: "low", code: "SENSOR_STUCK" },
    curtailment: { severity: "info", code: "CURTAILMENT" },
  };
  const x = map[fault.type] || { severity: "info", code: "GENERIC" };
  return {
    severity: x.severity,
    alarm_code: x.code,
    message: `Synthetic ${fault.type} event`,
  };
}

function mkEnvelope({ deviceId, sourceId, sourceType, seq, ts, rawPayload, fault }) {
  return {
    meta: {
      schema_version: "1.0.0",
      trace_id: `${deviceId}-${sourceId}-${seq}`,
      device_id: deviceId,
      source_id: sourceId,
      source_type: sourceType,
      seq,
      ts,
    },
    raw_payload: rawPayload,
    tags: {
      fault_label: fault ? fault.type : "normal",
    },
    features: {},
    inference: {},
    storage: {},
    sync: {},
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishEvents(ingestUrl, events) {
  if (!ingestUrl || events.length === 0) return;
  try {
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
  return { ok: true };
}

async function main() {
  const args = parseArgs(process.argv);
  const durationSec = toNum(args["duration-sec"], 0); // 0 = run forever
  const cadenceMs = toNum(args["cadence-ms"], 500);
  const turbines = toNum(args["turbines"], 1);
  const seed = toNum(args.seed, 42);
  const faultMode = normalizeFaultMode(args["fault-mode"] || "mixed"); // none|gearbox_overheat|overheat|imbalance|stuck|mixed
  const faultIntensity = toNum(args["fault-intensity"], 1);
  const faultStartSec = toNum(args["fault-start-sec"], -1);
  const faultDurationSec = toNum(args["fault-duration-sec"], -1);
  const vibrationMultiplier = toNum(args["vibration-multiplier"], 1);
  const outPath = args.out || "";
  const ingestUrl = args["ingest-url"] || "";
  const consoleMode = (args["console-mode"] || "stats").toLowerCase(); // raw|stats|silent
  const realtime = String(args.realtime || "true").toLowerCase() !== "false";
  const startTs = args["start-ts"] ? new Date(args["start-ts"]) : new Date();
  const totalSteps = durationSec > 0 ? Math.max(1, Math.floor((durationSec * 1000) / cadenceMs)) : Number.MAX_SAFE_INTEGER;

  const fileOut = outPath ? fs.createWriteStream(outPath, { encoding: "utf8" }) : null;

  let emitted = 0;
  let published = 0;
  let publishFailures = 0;
  let secProduced = 0;
  let secPublished = 0;
  let lastFault = "normal";

  let statTimer = null;
  if (consoleMode === "stats") {
    statTimer = setInterval(() => {
      const payload = {
        module: "01-simulator",
        produced_per_sec: secProduced,
        published_per_sec: secPublished,
        total_produced: emitted,
        total_published: published,
        publish_failures: publishFailures,
        fault_label: lastFault,
      };
      process.stdout.write(`__METRIC__ ${JSON.stringify(payload)}\n`);
      secProduced = 0;
      secPublished = 0;
    }, 1000);
  }

  for (let i = 0; i < turbines; i += 1) {
    const deviceId = `TURBINE_${String(i + 1).padStart(2, "0")}`;
    const rand = mkRng(seed + i * 997);
    const plan = durationSec > 0 ? buildFaultPlan(totalSteps, faultMode) : [];
    let seqScada = 0;
    let seqVib = 0;
    let seqAlarm = 0;

    for (let step = 0; step < totalSteps; step += 1) {
      const tickEvents = [];
      const t = step;
      const ts = realtime ? new Date().toISOString() : new Date(startTs.getTime() + step * cadenceMs).toISOString();
      let fault =
        durationSec > 0 ? activeFault(step, plan) : activeFaultRealtime(step, faultMode);
      if (faultStartSec >= 0 && faultDurationSec > 0) {
        const startStep = Math.floor((faultStartSec * 1000) / cadenceMs);
        const endStep = startStep + Math.floor((faultDurationSec * 1000) / cadenceMs);
        fault =
          step >= startStep && step <= endStep
            ? { type: faultMode === "none" ? "gearbox_overheat" : faultMode }
            : null;
      }

      const scada = scadaSignals(t, rand, i, fault, faultIntensity);
      seqScada += 1;
      {
        const event = mkEnvelope({
            deviceId,
            sourceId: "scada_main",
            sourceType: "scada",
            seq: seqScada,
            ts,
            rawPayload: scada,
            fault,
          });
        const line = `${JSON.stringify(event)}\n`;
        if (consoleMode === "raw") process.stdout.write(line);
        if (fileOut) fileOut.write(line);
        tickEvents.push(event);
      }
      emitted += 1;
      secProduced += 1;
      lastFault = fault ? fault.type : "normal";

      const vib = vibrationSignals(t, rand, scada, fault, faultIntensity, vibrationMultiplier);
      seqVib += 1;
      {
        const event = mkEnvelope({
            deviceId,
            sourceId: "vibration_cms_1",
            sourceType: "vibration_cms",
            seq: seqVib,
            ts,
            rawPayload: vib,
            fault,
          });
        const line = `${JSON.stringify(event)}\n`;
        if (consoleMode === "raw") process.stdout.write(line);
        if (fileOut) fileOut.write(line);
        tickEvents.push(event);
      }
      emitted += 1;
      secProduced += 1;
      lastFault = fault ? fault.type : "normal";

      const alarm = alarmEvent(t, fault);
      if (alarm) {
        seqAlarm += 1;
        {
          const event = mkEnvelope({
              deviceId,
              sourceId: "alarm_log_1",
              sourceType: "alarm_log",
              seq: seqAlarm,
              ts,
              rawPayload: alarm,
              fault,
            });
          const line = `${JSON.stringify(event)}\n`;
          if (consoleMode === "raw") process.stdout.write(line);
          if (fileOut) fileOut.write(line);
          tickEvents.push(event);
        }
        emitted += 1;
        secProduced += 1;
        lastFault = fault ? fault.type : "normal";
      }

      if (tickEvents.length > 0) {
        // Publish per cadence tick to keep implementation simple and observable.
        const pub = await publishEvents(ingestUrl, tickEvents);
        if (pub.ok) {
          published += tickEvents.length;
          secPublished += tickEvents.length;
        } else {
          publishFailures += 1;
          if (consoleMode !== "silent") {
            process.stderr.write(`[sim] publish failed: ${pub.reason}\n`);
          }
        }
      }

      if (realtime) {
        await sleep(cadenceMs);
      }
    }
  }

  if (fileOut) fileOut.end();
  if (statTimer) clearInterval(statTimer);
  if (consoleMode !== "silent") {
    console.error(`Generated ${emitted} events across ${turbines} turbine(s).`);
  }
}

main();
