import { motion } from "framer-motion";
import { usePipelineStore } from "~/stores/pipelineStore";
import { edgeguardApi } from "~/lib/api";
import type { SensorData } from "~/types/edgeguard";
import { SENSOR_RANGES, sensorColor } from "~/types/edgeguard";

// ---------------------------------------------------------------------------
// Sensor bar row
// ---------------------------------------------------------------------------

function SensorBar({
  label,
  value,
  unit,
  min,
  max,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  color: string;
}) {
  const span     = max - min;
  const fraction = Math.max(0, Math.min(1, (value - min) / span));

  return (
    <div className="flex flex-col gap-[2px]">
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] tracking-[0.04em] text-[var(--eg-text-dim)]">
          {label}
        </span>
        <span className="font-mono text-[11px] font-semibold" style={{ color }}>
          {value % 1 === 0 ? value : value.toFixed(1)}
          <span className="text-[9px] text-[var(--eg-text-dim)] ml-[2px]">{unit}</span>
        </span>
      </div>
      <div className="h-[4px] rounded-full bg-[var(--eg-border)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sensor grid (2 columns × 3 rows)
// ---------------------------------------------------------------------------

const SENSOR_KEYS = [
  "temperature",
  "vibration",
  "rpm",
  "powerOutput",
  "windSpeed",
  "bladePitch",
] as const;

function SensorGrid({ sensors }: { sensors: SensorData }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 mb-2">
      {SENSOR_KEYS.map((key) => {
        const meta  = SENSOR_RANGES[key];
        const value = sensors[key];
        const color = sensorColor(key, value);
        return (
          <SensorBar
            key={key}
            label={meta.label}
            value={value}
            unit={meta.unit}
            min={meta.min}
            max={meta.max}
            color={color}
          />
        );
      })}
    </div>
  );
}

const ZERO_SENSORS: SensorData = {
  temperature: 0,
  vibration: 0,
  rpm: 0,
  powerOutput: 0,
  windSpeed: 0,
  bladePitch: 0,
};

// ---------------------------------------------------------------------------
// TurbineCard
// ---------------------------------------------------------------------------

export function TurbineCard({
  turbineId,
  delay,
}: {
  turbineId: number;
  delay: number;
}) {
  const history = usePipelineStore((s) => s.perTurbineHistory[turbineId] || []);
  const activeTransitCount = usePipelineStore(
    (s) =>
      s.ingestEntities.filter(
        (entity) => entity.kind === "anomaly" && entity.turbineId === turbineId,
      ).length,
  );

  const lastPoint  = history[history.length - 1];
  const lastValue  = lastPoint?.value ?? 0;
  const lastScore  = lastPoint?.anomalyScore ?? 0;
  const isAnomaly  = lastPoint?.type === "anomaly";
  const displaySensors = lastPoint?.sensors ?? ZERO_SENSORS;

  // Sparkline using power_output (= value)
  const sparkData = history.slice(-20);
  const maxVal    = Math.max(...sparkData.map((d) => d.value), 1);
  const minVal    = Math.min(...sparkData.map((d) => d.value), 0);
  const range     = maxVal - minVal || 1;
  const sparkW    = 100;
  const sparkH    = 28;
  const sparkPoints = sparkData
    .map((d, i) => {
      const x = (i / Math.max(sparkData.length - 1, 1)) * sparkW;
      const y = sparkH - ((d.value - minVal) / range) * sparkH;
      return `${x},${y}`;
    })
    .join(" ");

  const scoreColor =
    lastScore > 0.7
      ? "var(--eg-anomaly)"
      : lastScore > 0.4
      ? "var(--eg-alert)"
      : "var(--eg-ok)";

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay }}
      className={`eg-panel p-5 transition-all duration-300 ${
        activeTransitCount > 0 ? "glow-red-box border-[var(--eg-anomaly)]/50" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className={`eg-led ${isAnomaly ? "eg-led-offline" : "eg-led-online"}`} />
          <span className="font-display text-[16px] tracking-[0.02em] text-[var(--eg-text-bright)] font-semibold">
            TURBINE {turbineId}
          </span>
        </div>
        <span className="font-mono text-[13px] text-[var(--eg-text-dim)]">T{turbineId}</span>
      </div>

      {/* Sparkline (power output) */}
      <div className="mb-3">
        <svg
          viewBox={`0 0 ${sparkW} ${sparkH}`}
          className="w-full h-7"
          preserveAspectRatio="none"
        >
          {sparkData.length > 1 && (
            <polyline
              points={sparkPoints}
              fill="none"
              stroke={isAnomaly ? "var(--eg-anomaly)" : "var(--eg-flow)"}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {sparkData.map((d, i) => {
            const x = (i / Math.max(sparkData.length - 1, 1)) * sparkW;
            const y = sparkH - ((d.value - minVal) / range) * sparkH;
            return d.type === "anomaly" ? (
              <circle key={i} cx={x} cy={y} r={2} fill="var(--eg-anomaly)" />
            ) : null;
          })}
        </svg>
      </div>

      {/* Primary value + score */}
      <div className="flex items-center justify-between text-[15px] mb-3">
        <div>
          <span className="text-[var(--eg-text-dim)]">POWER </span>
          <span className="font-mono text-[var(--eg-text-bright)] font-semibold">
            {lastValue.toFixed(0)}
            <span className="text-[11px] text-[var(--eg-text-dim)] ml-[2px]">kW</span>
          </span>
        </div>
        <div>
          <span className="text-[var(--eg-text-dim)]">SCORE </span>
          <span className="font-mono font-semibold" style={{ color: scoreColor }}>
            {lastScore.toFixed(3)}
          </span>
        </div>
      </div>

      <SensorGrid sensors={displaySensors} />

      {/* Anomaly score bar */}
      <div className="h-2 rounded-full bg-[var(--eg-border)] overflow-hidden mb-4">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: scoreColor }}
          animate={{ width: `${Math.min(100, lastScore * 100)}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Inject button */}
      <button
        onClick={() => {
          edgeguardApi.injectAnomaly(turbineId).catch(() => {});
        }}
        className={`w-full py-3 rounded-xl text-[13px] font-display tracking-[0.02em] font-semibold transition-all duration-200 ${
          activeTransitCount > 0
            ? "bg-[var(--eg-anomaly)] text-white border border-[var(--eg-anomaly)]"
            : "bg-[#f7f9fc] border border-[var(--eg-border)] text-[var(--eg-text)] hover:border-[var(--eg-flow)]/50 hover:text-[var(--eg-flow)]"
        }`}
      >
        INJECT ANOMALY
      </button>
    </motion.div>
  );
}
