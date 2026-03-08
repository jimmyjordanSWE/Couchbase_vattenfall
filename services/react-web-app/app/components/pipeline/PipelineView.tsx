import { motion } from "framer-motion";
import {
  selectIsMeshGatewayActive,
  selectIsOnline,
  selectIsRecoverySyncActive,
  selectIsRunning,
  usePipelineStore,
} from "~/stores/pipelineStore";
import { isDataPoint } from "~/types/edgeguard";

const SCENE = {
  width: 1088,
  height: 348,
  cardWidth: 182,
  cardHeight: 88,
  turbineX: 20,
  turbineYs: [18, 130, 242],
  stageY: 188,
  rightPadding: 26,
  laneStartGap: 110,
  feederInset: 46,
  cloudRadius: 31,
  meshOffsetY: 116,
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
  highlighted,
}: {
  active: boolean;
  highlighted: boolean;
}) {
  const stroke = !active
    ? "var(--eg-muted)"
    : highlighted
      ? "var(--eg-anomaly)"
      : "var(--eg-flow)";

  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden="true">
      <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
        <line x1="20" y1="18" x2="20" y2="33" strokeWidth="1.8" />
        <circle cx="20" cy="16" r="2.2" fill={stroke} stroke="none" opacity={active ? 0.9 : 0.45} />
        {[
          { x2: 20, y2: 4 },
          { x2: 10, y2: 23 },
          { x2: 30, y2: 23 },
        ].map((blade) => (
          <line key={`${blade.x2}-${blade.y2}`} x1="20" y1="16" x2={blade.x2} y2={blade.y2} strokeWidth="1.8">
            {active ? (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 20 16"
                to="360 20 16"
                dur={highlighted ? "0.9s" : "2.6s"}
                repeatCount="indefinite"
              />
            ) : null}
          </line>
        ))}
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
  highlighted,
  isRunning,
}: {
  x: number;
  y: number;
  title: string;
  status: string;
  power: number;
  highlighted: boolean;
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
          <WindmillMark active={isRunning} highlighted={highlighted} />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--eg-text-dim)]">Power</span>
        <span
          className="font-mono text-[15px] font-semibold"
          style={{ color: highlighted ? "var(--eg-anomaly)" : "var(--eg-text)" }}
        >
          {Math.round(power)} kW
        </span>
      </div>
    </motion.div>
  );
}

function FlowStroke({
  path,
  color,
  width,
  active,
  duration,
  dashArray = "12 12",
  opacity = 0.9,
}: {
  path: string;
  color: string;
  width: number;
  active: boolean;
  duration: string;
  dashArray?: string;
  opacity?: number;
}) {
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dashArray}
      opacity={opacity}
      className={`eg-flow-stroke ${active ? "eg-flow-running" : "eg-flow-paused"}`}
      style={{ animationDuration: duration }}
    />
  );
}

function PipelineDiagram({
  isRunning,
  isOnline,
  isRecoverySyncActive,
  isMeshGatewayActive,
  hasRecentAnomaly,
  edgeCapacity,
  edgeCount,
  edgeAnomalyCount,
  centralCount,
  compactionCount,
}: {
  isRunning: boolean;
  isOnline: boolean;
  isRecoverySyncActive: boolean;
  isMeshGatewayActive: boolean;
  hasRecentAnomaly: boolean;
  edgeCapacity: number;
  edgeCount: number;
  edgeAnomalyCount: number;
  centralCount: number;
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
  const meshX = edgeTankX;
  const meshY = SCENE.stageY - SCENE.meshOffsetY - 8;
  const meshPath = `M ${edgeTankX} ${SCENE.stageY - 58} L ${meshX} ${meshY + 18}`;
  const laneStartX = mainStartX;
  const laneMidX = edgeTankX - 62;
  const laneResumeX = edgeTankX + 66;
  const laneEndX = cloudDbX - 50;
  const pathIngest = `M ${laneStartX} ${feederTargetY} L ${laneMidX} ${feederTargetY}`;
  const pathSync = `M ${laneResumeX} ${feederTargetY} L ${laneEndX} ${feederTargetY}`;
  const feederFlowDur = "1.1s";
  const ingestFlowDur = "1.0s";
  const syncFlowDur = isRecoverySyncActive ? "0.45s" : "0.9s";
  const tankInnerWidth = 68;
  const tankInnerHeight = 108;
  const tankBottomY = 54;
  const visualEdgeRatio = Math.min(1, edgeCount / Math.max(edgeCapacity, 1));
  const edgeFillHeight = Math.max(0, visualEdgeRatio * tankInnerHeight);
  const edgeFillTopY = tankBottomY - edgeFillHeight;
  const anomalyLayerHeight = edgeAnomalyCount > 0
    ? Math.min(
        edgeFillHeight,
        (Math.min(edgeAnomalyCount, edgeCapacity) / Math.max(edgeCapacity, 1)) * tankInnerHeight,
      )
    : 0;
  const normalLayerHeight = Math.max(0, edgeFillHeight - anomalyLayerHeight);
  const normalLayerY = edgeFillTopY + anomalyLayerHeight;
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
        <clipPath id="edge-tank-fill-clip">
          <rect x="-34" y="-54" width="68" height="108" rx="8" />
        </clipPath>
      </defs>

      {feederPaths.map((path) => (
        <g key={path}>
          <path
            d={path}
            fill="none"
            stroke="rgba(32, 113, 181, 0.18)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <FlowStroke
            path={path}
            color={hasRecentAnomaly ? "var(--eg-anomaly)" : "var(--eg-flow)"}
            width={2.4}
            active={isRunning}
            duration={feederFlowDur}
            dashArray="10 14"
            opacity={0.95}
          />
        </g>
      ))}

      <path d={pathIngest} fill="none" stroke="rgba(32, 113, 181, 0.18)" strokeWidth="2" strokeLinecap="round" />
      <FlowStroke
        path={pathIngest}
        color={hasRecentAnomaly ? "var(--eg-anomaly)" : "var(--eg-flow)"}
        width={2.4}
        active={isRunning}
        duration={ingestFlowDur}
        dashArray="10 14"
      />
      <path d={pathSync} fill="none" stroke="rgba(32, 113, 181, 0.18)" strokeWidth="2" strokeLinecap="round" />
      <path
        d={pathSync}
        fill="none"
        stroke={
          isOnline
            ? "rgba(32, 113, 181, 0.18)"
            : isRunning
              ? "rgba(249, 59, 24, 0.22)"
              : "rgba(194, 207, 218, 0.72)"
        }
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={isOnline ? undefined : "10 10"}
      />
      <FlowStroke
        path={pathSync}
        color={hasRecentAnomaly ? "var(--eg-anomaly)" : "var(--eg-flow)"}
        width={2.4}
        active={isRunning && isOnline}
        duration={syncFlowDur}
        dashArray="10 14"
      />

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
          stroke="var(--eg-flow)"
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
        <text x="0" y="52" textAnchor="middle" fill="var(--eg-flow)" fontSize="9" fontWeight="600">
          {isRunning ? "SCORING LIVE" : "MODEL IDLE"}
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
          stroke={visualEdgeRatio > 0.7 ? "var(--eg-alert)" : "var(--eg-border-bright)"}
          strokeWidth="1.5"
        />
        <g clipPath="url(#edge-tank-fill-clip)">
          {edgeAnomalyCount > 0 ? (
            <>
              {normalLayerHeight > 0 ? (
                <rect
                  x="-34"
                  y={normalLayerY}
                  width={tankInnerWidth}
                  height={normalLayerHeight}
                  fill={visualEdgeRatio > 0.7 ? "rgba(255, 218, 0, 0.24)" : "rgba(32, 113, 181, 0.18)"}
                />
              ) : null}
              <rect
                x="-34"
                y={edgeFillTopY}
                width={tankInnerWidth}
                height={anomalyLayerHeight}
                fill="rgba(249, 59, 24, 0.22)"
              />
            </>
          ) : (
            <rect
              x="-34"
              y={edgeFillTopY}
              width={tankInnerWidth}
              height={edgeFillHeight}
              rx="8"
              fill={visualEdgeRatio > 0.7 ? "rgba(255, 218, 0, 0.24)" : "rgba(32, 113, 181, 0.18)"}
            />
          )}
        </g>
        <text x="0" y="80" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          COUCHBASE EDGE
        </text>
        <text
          x="0"
          y="94"
          textAnchor="middle"
          fill={visualEdgeRatio > 0.7 ? "var(--eg-alert)" : "var(--eg-flow)"}
          fontSize="10"
          fontWeight="700"
        >
          {edgeCount}/{edgeCapacity}
        </text>
      </g>

      <path
        d={meshPath}
        fill="none"
        stroke={isMeshGatewayActive ? "rgba(61, 192, 124, 0.24)" : "rgba(194, 207, 218, 0.7)"}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <FlowStroke
        path={meshPath}
        color={hasRecentAnomaly ? "var(--eg-anomaly)" : "var(--eg-ok)"}
        width={2.4}
        active={isRunning && isMeshGatewayActive}
        duration="0.9s"
        dashArray="10 12"
      />

      <g transform={`translate(${meshX}, ${meshY})`}>
        <rect
          x="-34"
          y="-18"
          width="68"
          height="36"
          rx="12"
          fill="rgba(255,255,255,0.92)"
          stroke={isMeshGatewayActive ? "var(--eg-ok)" : "var(--eg-border-bright)"}
          strokeWidth="1.5"
        />
        {isMeshGatewayActive ? (
          <>
            <path
              d="M 0 -10 L 0 6 M -7 -1 L 0 6 L 7 -1"
              fill="none"
              stroke="var(--eg-ok)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M -16 10 L 16 10"
              fill="none"
              stroke="var(--eg-ok)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path
              d="M -16 8 L -6 -2 L 0 4 L 12 -10 L 18 -4"
              fill="none"
              stroke="var(--eg-muted)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.68"
            />
            {[
              [-16, 8],
              [-6, -2],
              [0, 4],
              [12, -10],
              [18, -4],
            ].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.4" fill="var(--eg-muted)" opacity="0.68" />
            ))}
          </>
        )}
        <text x="0" y="34" textAnchor="middle" fill="var(--eg-text-dim)" fontSize="11" fontWeight="600">
          MESH GATEWAY
        </text>
      </g>

      <g transform={`translate(${linkX}, ${SCENE.stageY})`}>
        <path
          d="M -22 4 Q -12 -12 0 -12 Q 12 -12 22 4"
          fill="none"
          stroke={isOnline ? "var(--eg-border-bright)" : isRunning ? "var(--eg-anomaly)" : "var(--eg-muted)"}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={isOnline ? 1 : isRunning ? 0.92 : 0.7}
        />
        <path
          d="M -14 4 Q -8 -4 0 -4 Q 8 -4 14 4"
          fill="none"
          stroke={isOnline ? "var(--eg-border-bright)" : isRunning ? "var(--eg-anomaly)" : "var(--eg-muted)"}
          strokeWidth="4"
          strokeLinecap="round"
          opacity={isOnline ? 0.92 : isRunning ? 0.86 : 0.62}
        />
        <circle
          cx="0"
          cy="7"
          r="4"
          fill={isOnline ? "var(--eg-flow)" : isRunning ? "var(--eg-anomaly)" : "var(--eg-muted)"}
          opacity={isOnline ? 0.9 : isRunning ? 1 : 0.72}
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
          {centralCount}
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
  const isRunning = usePipelineStore(selectIsRunning);
  const isOnline = usePipelineStore(selectIsOnline);
  const isRecoverySyncActive = usePipelineStore(selectIsRecoverySyncActive);
  const isMeshGatewayActive = usePipelineStore(selectIsMeshGatewayActive);
  const edgeCapacity = usePipelineStore((s) => s.config.edgeCapacity);
  const compactionCount = usePipelineStore((s) => s.metrics.compactionCount);
  const centralCount = usePipelineStore((s) => s.metrics.centralStorageLength);
  const perTurbineHistory = usePipelineStore((s) => s.perTurbineHistory);
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);

  const edgeAnomalyCount = edgeStorage.filter(
    (item) => isDataPoint(item) && item.type === "anomaly",
  ).length;
  const hasRecentAnomaly = Object.values(perTurbineHistory).some((history) => {
    const latest = history[history.length - 1];
    return latest?.type === "anomaly";
  });

  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto min-w-[1088px]" style={{ height: SCENE.height }}>
        <PipelineDiagram
          isRunning={isRunning}
          isOnline={isOnline}
          isRecoverySyncActive={isRecoverySyncActive}
          isMeshGatewayActive={isMeshGatewayActive}
          hasRecentAnomaly={hasRecentAnomaly}
          edgeCapacity={edgeCapacity}
          edgeCount={edgeStorage.length}
          edgeAnomalyCount={edgeAnomalyCount}
          centralCount={centralCount}
          compactionCount={compactionCount}
        />

        {[1, 2, 3].map((turbineId, index) => {
          const history = perTurbineHistory[turbineId] ?? [];
          const latest = history[history.length - 1];
          const power = latest?.value ?? 0;
          const highlighted = latest?.type === "anomaly";

          return (
            <TurbineStageCard
              key={turbineId}
              x={SCENE.turbineX}
              y={SCENE.turbineYs[index]}
              title={`Turbine ${turbineId}`}
              status={highlighted ? "anomaly detected" : isRunning ? "telemetry live" : "standby"}
              power={power}
              highlighted={highlighted}
              isRunning={isRunning}
            />
          );
        })}
      </div>
    </div>
  );
}
