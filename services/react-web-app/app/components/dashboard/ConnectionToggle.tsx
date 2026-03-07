import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePipelineStore } from "~/stores/pipelineStore";
import { edgeguardApi } from "~/lib/api";

export function ConnectionToggle({ delay }: { delay: number }) {
  const isOnline = usePipelineStore((s) => s.isOnline);
  const clearPipelineData = usePipelineStore((s) => s.clearPipelineData);
  const [isClearing, setIsClearing] = useState(false);

  const setOnline = (online: boolean) => {
    edgeguardApi.setConnection(online).catch(() => {});
  };

  const clearDatabase = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      await edgeguardApi.clearDatabase();
      clearPipelineData();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24, delay }}
      className="eg-panel p-5"
    >
      <div className="text-center mb-4">
        <span className="font-display text-[11px] tracking-[0.08em] text-[var(--eg-text-dim)] font-semibold">
          NETWORK CONTROL
        </span>
      </div>

      <button
        onClick={() => setOnline(!isOnline)}
        className={`relative w-full py-4 rounded-2xl font-display text-[11px] tracking-[0.08em] font-semibold transition-all duration-300 overflow-hidden ${
          isOnline
            ? "bg-white border-2 border-[var(--eg-anomaly)]/25 text-[var(--eg-anomaly)] hover:bg-[var(--eg-anomaly)]/6"
            : "bg-[var(--eg-flow)] border-2 border-[var(--eg-flow)] text-white hover:bg-[#1c65a3]"
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={isOnline ? "kill" : "restore"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="block"
          >
            {isOnline ? "KILL CONNECTION" : "RESTORE LINK"}
          </motion.span>
        </AnimatePresence>
      </button>

      {/* Signal indicator */}
      <div className="flex items-center justify-center gap-1 mt-2.5">
        {[1, 2, 3, 4].map((bar) => (
          <div
            key={bar}
            className="w-1 rounded-full transition-all duration-300"
            style={{
              height: `${bar * 4 + 4}px`,
              backgroundColor: isOnline
                ? bar <= 4 ? "var(--eg-ok)" : "var(--eg-muted)"
                : bar <= 0 ? "var(--eg-anomaly)" : "var(--eg-muted)",
              opacity: isOnline ? 1 : 0.3,
            }}
          />
        ))}
      </div>

      <button
        onClick={clearDatabase}
        disabled={isClearing}
        className="mt-4 w-full rounded-2xl border border-[var(--eg-border)] bg-[#f7f9fc] px-3 py-3 font-display text-[11px] font-semibold tracking-[0.08em] text-[var(--eg-flow)] transition-all duration-300 hover:border-[var(--eg-flow)]/40 hover:bg-[var(--eg-flow)]/6 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={isClearing ? "clearing" : "clear"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="block"
          >
            {isClearing ? "CLEARING DATABASE" : "CLEAR COUCHBASE DB"}
          </motion.span>
        </AnimatePresence>
      </button>
    </motion.div>
  );
}
