import { motion } from "framer-motion";
import { EDGE_CAPACITY, usePipelineStore } from "~/stores/pipelineStore";

const SCENE = {
  width: 1088,
  height: 292,
  cardWidth: 182,
  cardHeight: 88,
  turbineX: 20,
  turbineYs: [6, 102, 198],
  stageY: 146,
  rightPadding: 26,
  laneStartGap: 110,
  feederInset: 46,
  cloudRadius: 31,
} as const;

function getPipelineLayout() {
  const turbineRightX = SCENE.turbineX + SCENE.cardWidth;
  const usableStartX = turbineRightX + SCENE.laneStartGap;
  const usableEndX = SCENE.width - SCENE.rightPadding;
  const usableWidth = usableEndX - usableStartX;

  return {
    turbineRightX,
    usableStartX,
    usableEndX,
    aiX: usableStartX + usableWidth * 0.12,
    edgeX: usableStartX + usableWidth * 0.46,
    linkX: usableStartX + usableWidth * 0.73,
    cloudX: usableEndX - SCENE.cloudRadius,
  };
}

function WindmillMark({
  active,
  anomaly,
}: {
  active: boolean;
  anomaly: boolean;
}) {
  const stroke = !active
    ? "var(--eg-muted)"
    : anomaly
      ? "var(--eg-anomaly)"
      : "var(--eg-flow)";

  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        <line x1="20" y1="18" x2="20" y2="33" strokeWidth="1.8" />
        <circle cx="20" cy="16" r="2.2" fill={stroke} stroke="none" opacity={active ? 0.9 : 0.45} />
        <line x1="20" y1="16" x2="20" y2="4" strokeWidth="1.8">
          {active ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 20 16"
              to="360 20 16"
              dur={anomaly ? "0.9s" : "2.6s"}
              repeatCount="indefinite"
            />
          ) : null}
        </line>
        <line x1="20" y1="16" x2="10" y2="23" strokeWidth="1.8">
          {active ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 20 16"
              to="360 20 16"
              dur={anomaly ? "0.9s" : "2.6s"}
              repeatCount="indefinite"
            />
          ) : null}
        </line>
        <line x1="20" y1="16" x2="30" y2="23" strokeWidth="1.8">
          {active ? (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 20 16"
              to="360 20 16"
              dur={anomaly ? "0.9s" : "2.6s"}
              repeatCount="indefinite"
            />
          ) : null}
        </line>
      </g>
    </svg>
  );
}

function TurbineStageCard({
  x,
  y,
  title,
  status,
  power,
  anomalyActive,
  isRunning,
}: {
  x: number;
  y: number;
  title: string;
  status: string;
  power: number;
  anomalyActive: boolean;
  isRunning: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="absolute rounded-[18px] border border-[var(--eg-border)] bg-white/96 px-4 py-3 shadow-[0_14px_30px_rgba(30,50,79,0.10)]"
      style={{
        left: x,
        top: y,
        width: SCENE.cardWidth,
        height: SCENE.cardHeight,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-[var(--eg-text-dim)]">
            {title}
          </div>
          <div className="mt-1 text-[12px] font-medium text-[var(--eg-text)]">{status}</div>
        </div>
        <div className="shrink-0">
          <WindmillMark active={isRunning} anomaly={anomalyActive} />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--eg-text-dim)]">Power</span>
        <span
          className="font-mono text-[15px] font-semibold"
          style={{ color: anomalyActive ? "var(--eg-anomaly)" : "var(--eg-text)" }}
        >
          {Math.round(power)} kW
        </span>
      </div>
    </motion.div>
  );
}

function PipelineDiagram({
  isRunning,
  isOnline,
  isRecoverySyncActive,
  forcedAnomalyTurbine,
  edgeRatio,
  edgeCount,
  cloudCount,
  compactionCount,
}: {
  isRunning: boolean;
  isOnline: boolean;
  isRecoverySyncActive: boolean;
  forcedAnomalyTurbine: number | null;
  edgeRatio: number;
  edgeCount: number;
  cloudCount: number;
  compactionCount: number;
}) {
  const layout = getPipelineLayout();
  const feederTargetY = SCENE.stageY;
  const turbineCenterX = layout.turbineRightX;
  const turbineCenterYs = SCENE.turbineYs.map((y) => y + SCENE.cardHeight / 2);
  const aiX = layout.aiX;
  const feederTargetX = aiX - SCENE.feederInset;
  const mainStartX = aiX + 34;
  const edgeTankX = layout.edgeX;
  const cloudDbX = layout.cloudX;
  const linkX = layout.linkX;
  const laneStartX = mainStartX;
  const laneMidX = edgeTankX - 62;
  const laneResumeX = edgeTankX + 66;
  const laneEndX = cloudDbX - 50;
  const pathIngest = `M ${laneStartX} ${feederTargetY} L ${laneMidX} ${feederTargetY}`;
  const pathSync = `M ${laneResumeX} ${feederTargetY} L ${laneEndX} ${feederTargetY}`;
  const conveyorDotDur = "2.2s";
  const recoveryDotDur = "0.9s";
  const syncDotDur = isRecoverySyncActive ? recoveryDotDur : conveyorDotDur;
  const feederPaths = turbineCenterYs.map(
    (y) =>
      `M ${turbineCenterX} ${y} C ${turbineCenterX + 56} ${y}, ${feederTargetX - 54} ${feederTargetY}, ${feederTargetX} ${feederTargetY}`,
  );

  return (
    <svg
      viewBox={`0 0 ${SCENE.width} ${SCENE.height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lane-blue" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="rgba(32, 113, 181, 0.14)" />
          <stop offset="100%" stopColor="rgba(32, 113, 181, 0.30)" />
        </linearGradient>
        <linearGradient id="lane-red" x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor="rgba(249, 59, 24, 0.16)" />
          <stop offset="100%" stopColor="rgba(249, 59, 24, 0.36)" />
        </linearGradient>
        <linearGradient id="belt-body" x1="0%" x2="0%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.78)" />
          <stop offset="100%" stopColor="rgba(226,234,243,0.96)" />
        </linearGradient>
      </defs>

      {feederPaths.map((path, index) => {
        const highlighted = forcedAnomalyTurbine === index + 1;
        return (
          <g key={path}>
            <path
              d={path}
              fill="none"
              stroke={highlighted ? "rgba(249, 59, 24, 0.30)" : "rgba(32, 113, 181, 0.18)"}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {isRunning ? (
              <circle r="3.2" fill={highlighted ? "var(--eg-anomaly)" : "var(--eg-flow)"}>
                <animateMotion dur={highlighted ? "0.8s" : "1.4s"} repeatCount="indefinite" path={path} />
              </circle>
            ) : null}
          </g>
        );
      })}

      <path d={pathIngest} fill="none" stroke="url(#belt-body)" strokeWidth="18" strokeLinecap="round" />
      <path d={pathIngest} fill="none" stroke="rgba(30, 50, 79, 0.08)" strokeWidth="18" strokeLinecap="round" transform="translate(0 1.5)" />
      <path d={pathIngest} fill="none" stroke="url(#lane-blue)" strokeWidth="10" strokeLinecap="round" />
      <path d={pathIngest} fill="none" stroke="rgba(255,255,255,0.58)" strokeWidth="2.5" strokeLinecap="round" transform="translate(0 -3)" />
      {isRunning ? (
        <>
          <circle r="5" fill="var(--eg-flow)">
            <animateMotion dur={conveyorDotDur} repeatCount="indefinite" path={pathIngest} />
          </circle>
          <circle r="4.2" fill={forcedAnomalyTurbine ? "var(--eg-anomaly)" : "var(--eg-flow)"}>
            <animateMotion
              dur={conveyorDotDur}
              repeatCount="indefinite"
              path={pathIngest}
            />
          </circle>
        </>
      ) : null}

      <path
        d={pathSync}
        fill="none"
        stroke="url(#belt-body)"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d={pathSync}
        fill="none"
        stroke="rgba(30, 50, 79, 0.08)"
        strokeWidth="18"
        strokeLinecap="round"
        transform="translate(0 1.5)"
      />
      <path
        d={pathSync}
        fill="none"
        stroke={isOnline ? "url(#lane-blue)" : "url(#lane-red)"}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={isOnline ? undefined : "16 12"}
      />
      {isOnline ? (
        <path d={pathSync} fill="none" stroke="rgba(255,255,255,0.58)" strokeWidth="2.5" strokeLinecap="round" transform="translate(0 -3)" />
      ) : null}
      {isRunning && isOnline ? (
        <circle r="5" fill={isOnline ? "var(--eg-flow)" : "var(--eg-anomaly)"}>
          <animateMotion dur={syncDotDur} repeatCount="indefinite" path={pathSync} />
        </circle>
      ) : null}

      <g transform={`translate(${aiX}, ${SCENE.stageY})`}>
        {isRunning ? (
          <circle cx="0" cy="0" r="32" fill="none" stroke="var(--eg-flow)" strokeWidth="0.7" opacity="0.14">
            <animate attributeName="r" values="28;36;28" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.18;0.04;0.18" dur="2.6s" repeatCount="indefinite" />
          </circle>
        ) : null}
        <polygon
          points="0,-18 15,-9 15,9 0,18 -15,9 -15,-9"
          fill="var(--eg-surface)"
          stroke={forcedAnomalyTurbine ? "var(--eg-anomaly)" : "var(--eg-flow)"}
          strokeWidth="1.4"
          opacity={isRunning ? 1 : 0.42}
        />
        <line x1="-6" y1="-6" x2="6" y2="-6" stroke="var(--eg-border-bright)" strokeWidth="1" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="var(--eg-border-bright)" strokeWidth="1" />
        <line x1="-6" y1="6" x2="6" y2="6" stroke="var(--eg-border-bright)" strokeWidth="1" />
        <line x1="0" y1="-8" x2="0" y2="8" stroke="var(--eg-border-bright)" strokeWidth="1" />
        <text x="0" y="38" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          EDGE AI
        </text>
        <text
          x="0"
          y="52"
          textAnchor="middle"
          fill={forcedAnomalyTurbine ? "var(--eg-anomaly)" : "var(--eg-flow)"}
          fontSize="9"
          fontWeight="600"
        >
          {forcedAnomalyTurbine ? `FOCUS T${forcedAnomalyTurbine}` : isRunning ? "SCORING LIVE" : "MODEL IDLE"}
        </text>
      </g>

      <g transform={`translate(${edgeTankX}, ${SCENE.stageY})`}>
        <rect
          x="-38"
          y="-58"
          width="76"
          height="116"
          rx="10"
          fill="rgba(255,255,255,0.78)"
          stroke={edgeRatio > 0.7 ? "var(--eg-alert)" : "var(--eg-border-bright)"}
          strokeWidth="1.5"
        />
        <rect
          x="-34"
          y={54 - edgeRatio * 108}
          width="68"
          height={Math.max(0, edgeRatio * 108)}
          rx="8"
          fill={edgeRatio > 0.7 ? "rgba(255, 218, 0, 0.24)" : "rgba(32, 113, 181, 0.18)"}
        />
        <circle
          cx="0"
          cy={54 - edgeRatio * 108}
          r="10"
          fill={edgeRatio > 0.7 ? "rgba(255, 218, 0, 0.32)" : "rgba(32, 113, 181, 0.20)"}
        />
        <text x="0" y="80" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          COUCHBASE EDGE
        </text>
        <text
          x="0"
          y="94"
          textAnchor="middle"
          fill={edgeRatio > 0.7 ? "var(--eg-alert)" : "var(--eg-flow)"}
          fontSize="10"
          fontWeight="700"
        >
          {edgeCount}/{EDGE_CAPACITY}
        </text>
      </g>

      <g transform={`translate(${linkX}, ${SCENE.stageY})`}>
        <path
          d="M -22 4 Q -12 -12 0 -12 Q 12 -12 22 4"
          fill="none"
          stroke={isOnline ? "var(--eg-border-bright)" : "var(--eg-anomaly)"}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={isOnline ? 1 : 0.92}
        />
        <path
          d="M -14 4 Q -8 -4 0 -4 Q 8 -4 14 4"
          fill="none"
          stroke={isOnline ? "var(--eg-border-bright)" : "var(--eg-anomaly)"}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={isOnline ? 0.92 : 0.86}
        />
        <circle
          cx="0"
          cy="7"
          r="4"
          fill={isOnline ? "var(--eg-flow)" : "var(--eg-anomaly)"}
          opacity={isOnline ? 0.9 : 1}
        >
          {!isOnline && isRunning ? (
            <animate attributeName="opacity" values="1;0.35;1" dur="0.85s" repeatCount="indefinite" />
          ) : null}
        </circle>
        <text x="0" y="38" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          {isOnline ? "LINK LIVE" : "LINK LOST"}
        </text>
      </g>

      <g transform={`translate(${cloudDbX}, ${SCENE.stageY})`}>
        <ellipse cx="0" cy="-22" rx="31" ry="9" fill="none" stroke="var(--eg-border-bright)" strokeWidth="1.4" />
        <path
          d="M -31 -22 L -31 24 C -31 31 -17 37 0 37 C 17 37 31 31 31 24 L 31 -22"
          fill="rgba(255,255,255,0.38)"
          stroke="var(--eg-border-bright)"
          strokeWidth="1.4"
        />
        <ellipse cx="0" cy="24" rx="31" ry="9" fill="none" stroke="var(--eg-border-bright)" strokeWidth="1.4" />
        <text x="0" y="10" textAnchor="middle" fill="var(--eg-flow)" fontSize="18" fontWeight="700">
          {cloudCount}
        </text>
        <text x="0" y="54" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          COUCHBASE CLOUD
        </text>
        <text
          x="0"
          y="68"
          textAnchor="middle"
          fill={compactionCount > 0 ? "var(--eg-alert)" : "var(--eg-flow)"}
          fontSize="9"
          fontWeight="600"
        >
          {compactionCount > 0 ? `${compactionCount} COMPACTIONS` : "SYNC TARGET"}
        </text>
      </g>
    </svg>
  );
}

export function PipelineView() {
  const isRunning = usePipelineStore((s) => s.isRunning);
  const isOnline = usePipelineStore((s) => s.isOnline);
  const isRecoverySyncActive = usePipelineStore((s) => s.isRecoverySyncActive);
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);
  const centralStorage = usePipelineStore((s) => s.centralStorage);
  const compactionCount = usePipelineStore((s) => s.compactionCount);
  const forcedAnomalyTurbine = usePipelineStore((s) => s.forcedAnomalyTurbine);
  const perTurbineHistory = usePipelineStore((s) => s.perTurbineHistory);

  const edgeRatio = Math.min(1, edgeStorage.length / EDGE_CAPACITY);
  const cloudCount = centralStorage.length;

  return (
    <div className="overflow-x-auto">
      <div
        className="relative mx-auto min-w-[1088px]"
        style={{ height: SCENE.height }}
      >
        <PipelineDiagram
          isRunning={isRunning}
          isOnline={isOnline}
          isRecoverySyncActive={isRecoverySyncActive}
          forcedAnomalyTurbine={forcedAnomalyTurbine}
          edgeRatio={edgeRatio}
          edgeCount={edgeStorage.length}
          cloudCount={cloudCount}
          compactionCount={compactionCount}
        />

        {[1, 2, 3].map((turbineId, index) => {
          const history = perTurbineHistory[turbineId] ?? [];
          const latest = history[history.length - 1];
          const power = latest?.value ?? 0;
          const anomalyActive = forcedAnomalyTurbine === turbineId;

          return (
            <TurbineStageCard
              key={turbineId}
              x={SCENE.turbineX}
              y={SCENE.turbineYs[index]}
              title={`Turbine ${turbineId}`}
              status={anomalyActive ? "anomaly burst armed" : isRunning ? "telemetry live" : "standby"}
              power={power}
              anomalyActive={anomalyActive}
              isRunning={isRunning}
            />
          );
        })}
      </div>
    </div>
  );
}
