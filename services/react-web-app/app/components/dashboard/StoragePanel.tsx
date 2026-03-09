import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { selectIsMeshGatewayActive, selectIsOnline } from "~/stores/pipelineSelectors";
import {
  usePipelineStore,
} from "~/stores/pipelineStore";
import { isCompactedBlock, isDataPoint } from "~/types/edgeguard";

function StorageCardShell({
  title,
  children,
  delay,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay: delay ?? 0 }}
      className="eg-panel relative min-h-[208px] overflow-hidden p-5"
    >
      <div className="mb-4 flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <ellipse cx="7" cy="3" rx="6" ry="2" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
          <rect x="1" y="3" width="12" height="8" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
          <ellipse cx="7" cy="11" rx="6" ry="2" fill="none" stroke="var(--eg-flow)" strokeWidth="1" />
        </svg>
        <span className="font-display text-[15px] font-semibold tracking-[0.02em] text-[var(--eg-text-bright)]">
          {title}
        </span>
      </div>
      {children}
    </motion.div>
  );
}

export function EdgeStorageCard({ delay }: { delay?: number }) {
  const edgeStorage = usePipelineStore((s) => s.edgeStorage);
  const edgeCapacity = usePipelineStore((s) => s.config.edgeCapacity);
  const compactionThreshold = usePipelineStore((s) => s.config.compactionThreshold);
  const compactionCount = usePipelineStore((s) => s.metrics.compactionCount);
  const edgePressure = usePipelineStore((s) => s.metrics.edgePressure);

  const edgeRatio = Math.min(1, edgeStorage.length / Math.max(edgeCapacity, 1));
  const inCompactionZone = edgeStorage.length >= compactionThreshold;

  const normalCount = edgeStorage.filter((i) => isDataPoint(i) && i.type === "normal").length;
  const anomalyCount = edgeStorage.filter((i) => isDataPoint(i) && i.type === "anomaly").length;
  const compactedCount = edgeStorage.filter(isCompactedBlock).length;

  const edgeBarColor = inCompactionZone
    ? "var(--eg-anomaly)"
    : edgeRatio > 0.6
      ? "var(--eg-alert)"
      : "var(--eg-flow)";

  const [compactFlash, setCompactFlash] = useState(false);
  useEffect(() => {
    if (compactionCount === 0) return;
    setCompactFlash(true);
    const timeoutId = setTimeout(() => setCompactFlash(false), 600);
    return () => clearTimeout(timeoutId);
  }, [compactionCount]);

  return (
    <StorageCardShell title="EDGE CAPACITY" delay={delay}>
      {compactFlash && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(179,136,255,0.08) 2px, rgba(179,136,255,0.08) 4px)",
          }}
          initial={{ opacity: 0.8, y: -40 }}
          animate={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.5 }}
        />
      )}

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-[var(--eg-text-dim)]">Capacity</span>
          <span className="font-mono text-[13px] text-[var(--eg-text-bright)]">
            {edgeStorage.length}/{edgeCapacity}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-[var(--eg-border)]">
          <motion.div
            className="h-full rounded-full"
            animate={{ width: `${edgeRatio * 100}%`, backgroundColor: edgeBarColor }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="rounded-xl bg-[#f7f9fc] px-3 py-2 text-center">
          <div className="font-mono font-bold text-[var(--eg-ok)]">{normalCount}</div>
          <div className="text-[var(--eg-text-dim)]">Normal</div>
        </div>
        <div className="rounded-xl bg-[#f7f9fc] px-3 py-2 text-center">
          <div className="font-mono font-bold text-[var(--eg-anomaly)]">{anomalyCount}</div>
          <div className="text-[var(--eg-text-dim)]">Anomaly</div>
        </div>
        <div className="rounded-xl bg-[#f7f9fc] px-3 py-2 text-center">
          <div className="font-mono font-bold text-[#b388ff]">{compactedCount}</div>
          <div className="text-[var(--eg-text-dim)]">Compact</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--eg-border)] pt-3 text-[11px]">
        <span className="text-[var(--eg-text-dim)]">Compactions</span>
        <span className="font-mono font-bold text-[var(--eg-alert)]">{compactionCount}</span>
      </div>

      {edgePressure > 0.3 && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--eg-anomaly)]">
          <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--eg-anomaly)]" />
          Pressure {Math.round(edgePressure * 100)}%
        </div>
      )}
    </StorageCardShell>
  );
}

export function CentralStorageCard({ delay }: { delay?: number }) {
  const isOnline = usePipelineStore(selectIsOnline);
  const isMeshGatewayActive = usePipelineStore(selectIsMeshGatewayActive);
  const centralCapacity = usePipelineStore((s) => s.config.centralCapacity ?? 100);
  const lastSyncTimestamp = usePipelineStore((s) => s.metrics.lastSyncTimestamp);
  const centralLength = usePipelineStore((s) => s.metrics.centralStorageLength);

  const lastSyncAgo = lastSyncTimestamp
    ? Math.round((Date.now() - lastSyncTimestamp) / 1000)
    : null;

  const [syncPulse, setSyncPulse] = useState(false);
  useEffect(() => {
    if (!lastSyncTimestamp) return;
    setSyncPulse(true);
    const timeoutId = setTimeout(() => setSyncPulse(false), 300);
    return () => clearTimeout(timeoutId);
  }, [lastSyncTimestamp]);

  return (
    <StorageCardShell title="CENTRAL CAPACITY" delay={delay}>
      {syncPulse && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-[var(--eg-flow)]/30"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />
      )}

      <div className="mb-3 flex items-center justify-between text-[11px]">
        <span className="text-[var(--eg-text-dim)]">Synced items</span>
        <span className="font-mono text-[18px] font-bold text-[var(--eg-text-bright)]">
          {centralLength}/{centralCapacity}
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="text-[var(--eg-text-dim)]">Status</span>
        <div className="flex items-center gap-2">
          <div className={`eg-led ${isOnline || isMeshGatewayActive ? "eg-led-online" : "eg-led-offline"}`} />
          <span className={`font-mono font-bold ${isOnline || isMeshGatewayActive ? "text-[var(--eg-ok)]" : "text-[var(--eg-anomaly)]"}`}>
            {isOnline ? "SYNCING" : isMeshGatewayActive ? "MESH DRAIN" : "OFFLINE"}
          </span>
        </div>
      </div>

      {lastSyncAgo !== null && (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[var(--eg-text-dim)]">Last sync</span>
          <span className="font-mono text-[var(--eg-text-dim)]">{lastSyncAgo}s ago</span>
        </div>
      )}
    </StorageCardShell>
  );
}

export function StoragePanel({ delay }: { delay: number }) {
  return (
    <div className="flex flex-col gap-4">
      <EdgeStorageCard delay={delay} />
      <CentralStorageCard delay={(delay ?? 0) + 0.05} />
    </div>
  );
}
