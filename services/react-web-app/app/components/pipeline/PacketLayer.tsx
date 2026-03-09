import { memo } from "react";
import { motion } from "framer-motion";
import { usePipelineStore } from "~/stores/pipelineStore";
import {
  BUFFER_X,
  CENTRAL_X,
  PIPE_START_X,
  PIPE_Y,
  TURBINE_POSITIONS,
  VALVE_X,
} from "~/components/pipeline/pipelineGeometry";
import { isDataPoint } from "~/types/edgeguard";

export const PacketLayer = memo(function PacketLayer() {
  const packetsInTransit = usePipelineStore((s) => s.packetsInTransit);
  const removePacket = usePipelineStore((s) => s.removePacket);
  const isMeshGatewayActive = usePipelineStore((s) => s.meshGatewayOverride ?? s.status.isMeshGatewayActive ?? false);

  return (
    <>
      {packetsInTransit.map((packet) => {
        if (isMeshGatewayActive && packet.segment === "to-central") {
          return null;
        }

        const isCompacted = packet.payload.type === "compacted";
        const start =
          packet.segment === "to-buffer" && isDataPoint(packet.payload)
            ? {
                x: TURBINE_POSITIONS[Math.max(0, Math.min(2, packet.payload.sourceTurbine - 1))].x,
                y: TURBINE_POSITIONS[Math.max(0, Math.min(2, packet.payload.sourceTurbine - 1))].y + 4,
              }
            : packet.segment === "mesh-to-cloud"
              ? { x: BUFFER_X - 6, y: PIPE_Y - 10 }
              : { x: BUFFER_X, y: PIPE_Y };
        const route =
          packet.segment === "to-buffer"
            ? {
                xs: [start.x - 8, PIPE_START_X - 8, BUFFER_X - 14],
                ys: [start.y, PIPE_Y, PIPE_Y],
                times: [0, 0.26, 1],
              }
            : packet.segment === "mesh-to-cloud"
              ? {
                  xs: [start.x, BUFFER_X + 80, CENTRAL_X - 84, CENTRAL_X - 8],
                  ys: [start.y, PIPE_Y - 58, PIPE_Y - 92, PIPE_Y - 20],
                  times: [0, 0.28, 0.72, 1],
                }
              : {
                  xs: [start.x, VALVE_X, CENTRAL_X - 12],
                  ys: [start.y, PIPE_Y, PIPE_Y],
                  times: [0, 0.52, 1],
                };

        const color = isCompacted ? "#b388ff" : "var(--eg-flow)";
        const size = packet.segment === "mesh-to-cloud" ? (isCompacted ? 6.2 : 5.2) : isCompacted ? 6 : 4.8;
        const duration = packet.durationMs / 1000;

        return (
          <g key={`${packet.segment}-${packet.id}`} filter="url(#glow-cyan)">
            <motion.circle
              initial={{ cx: route.xs[0] - 8, cy: route.ys[0] }}
              animate={{ cx: route.xs.map((x) => x - 8), cy: route.ys }}
              transition={{ duration, ease: "linear", times: route.times }}
              onAnimationComplete={() => removePacket(packet.id)}
              r={size * 0.6}
              fill={color}
              opacity={0.15}
            />
            <motion.circle
              initial={{ cx: route.xs[0] - 4, cy: route.ys[0] }}
              animate={{ cx: route.xs.map((x) => x - 4), cy: route.ys }}
              transition={{ duration, ease: "linear", times: route.times }}
              r={size * 0.8}
              fill={color}
              opacity={0.25}
            />
            <motion.circle
              initial={{ cx: route.xs[0], cy: route.ys[0] }}
              animate={{ cx: route.xs, cy: route.ys }}
              transition={{ duration, ease: "linear", times: route.times }}
              r={size}
              fill={color}
              opacity={0.9}
            />
            <motion.circle
              initial={{ cx: route.xs[0], cy: route.ys[0] }}
              animate={{ cx: route.xs, cy: route.ys }}
              transition={{ duration, ease: "linear", times: route.times }}
              r={size * 0.4}
              fill="white"
              opacity={0.6}
            />
          </g>
        );
      })}
    </>
  );
});
