import React, { useMemo, useState } from "react";
import { GlobeScene } from "./components/GlobeScene";
import { BottomLegend, LeftStatsPanel, RightDetailsPanel } from "./components/Panels";
import { usePNodeData, type PNodeSnapshot } from "./hooks";
import type { PNode } from "./types";
import type { HealthDetails, ReputationDetails, ReputationTier } from "./health";
import { buildNodeExplainability } from "./explain";

const App: React.FC = () => {
  const {
    nodes,
    loading,
    error,
    stats,
    healthById,
    reputationById,
    networkHealth,
    snapshots,
    failures,
    regionStats,
  } = usePNodeData({
    pollMs: 30_000,
  });
  const [hovered, setHovered] = useState<PNode | null>(null);
  const [selected, setSelected] = useState<PNode | null>(null);
  const [showArcs, setShowArcs] = useState(true);
  const [timeMode, setTimeMode] = useState<"live" | "1h" | "24h" | "7d">("live");
  const [timeIndex, setTimeIndex] = useState(0);
  const [reputationFilter, setReputationFilter] = useState<ReputationTier | "all">("all");
  const [heatmapMode, setHeatmapMode] = useState(false);

  const activeNode = selected ?? hovered;
  const activeHealth: HealthDetails | undefined =
    activeNode ? healthById.get(activeNode.pnodeId) : undefined;
  const activeReputation: ReputationDetails | undefined =
    activeNode ? reputationById.get(activeNode.pnodeId) : undefined;
  const explainability = activeNode
    ? buildNodeExplainability(
        activeNode,
        activeHealth,
        activeReputation,
        failures,
        snapshots,
        nodes
      )
    : undefined;

  const { displayNodes, displayHealthById, isSyntheticHistory, availableSnapshots } =
    useMemo(() => {
      if (timeMode === "live" || snapshots.length === 0) {
        return {
          displayNodes: nodes,
          displayHealthById: healthById,
          isSyntheticHistory: false,
          availableSnapshots: [] as PNodeSnapshot[],
        };
      }

      const now = Date.now();
      const windowSec =
        timeMode === "1h" ? 3600 : timeMode === "24h" ? 86400 : 7 * 86400;

      let windowSnapshots = snapshots.filter(
        (s) => now - s.timestamp <= windowSec * 1000
      );

      const isSynthetic = windowSnapshots.length === 0;

      if (isSynthetic) {
    
    
        const steps = 12;
        const oldest = now - windowSec * 1000;
        windowSnapshots = Array.from({ length: steps }, (_, i) => {
          const t = oldest + ((i + 1) / steps) * (windowSec * 1000);
          // Lightly shuffle status and lastSeen to simulate dynamics.
          const mutatedNodes = nodes.map((n, idx) => {
            const clone: PNode = { ...n };
            const jitter = ((idx * 7919 + i * 104729) % 1000) / 1000; // deterministic

            if (clone.status === "online" && jitter > 0.9) {
              clone.status = "unknown";
            } else if (clone.status === "unknown" && jitter > 0.8) {
              clone.status = "offline";
            }

            const offsetSec = (jitter - 0.5) * windowSec * 0.4;
            const baseLastSeen = new Date(clone.lastSeen).getTime() || now;
            clone.lastSeen = new Date(baseLastSeen - offsetSec * 1000).toISOString();

            return clone;
          });

          return { timestamp: t, nodes: mutatedNodes, synthetic: true };
        });
      }

      const clampedIndex =
        windowSnapshots.length > 0
          ? Math.min(timeIndex, windowSnapshots.length - 1)
          : 0;
      const snap = windowSnapshots[clampedIndex] ?? windowSnapshots[0];

      const map = new Map<string, HealthDetails>();
      if (snap) {
        snap.nodes.forEach((n) => {
          const h = healthById.get(n.pnodeId);
          if (h) map.set(n.pnodeId, h);
        });
      }

      return {
        displayNodes: snap ? snap.nodes : nodes,
        displayHealthById: map.size ? map : healthById,
        isSyntheticHistory: isSynthetic,
        availableSnapshots: windowSnapshots,
      };
    }, [timeMode, timeIndex, snapshots, nodes, healthById]);

  const orderedNodes = useMemo(
    () =>
      [...displayNodes]
        .filter((n) => {
          if (reputationFilter === "all") return true;
          const rep = reputationById.get(n.pnodeId);
          return rep?.tier === reputationFilter;
        })
        .sort((a, b) => {
        if (a.status === b.status) return 0;
        if (a.status === "online") return -1;
        if (b.status === "online") return 1;
        if (a.status === "unknown") return -1;
        if (b.status === "unknown") return 1;
        return 0;
        }),
    [displayNodes, reputationById, reputationFilter]
  );

  return (
    <div className="app">
      <GlobeScene
        nodes={orderedNodes}
        healthById={displayHealthById}
        anomaliesById={failures.anomaliesById}
        onHoverNode={setHovered}
        onSelectNode={setSelected}
        showArcs={showArcs}
        heatmapMode={heatmapMode}
      />

      <header className="app-header">
        <h1>XANDEUM P‑NODE ORBITAL</h1>
        <p className="subtitle">
          Real‑time pNode presence mapped onto a dark‑matter globe. Hover to sample, tap to
          inspect.
        </p>
      </header>

      <main className="app-main app-main-overlay">
        <LeftStatsPanel
          total={stats.total}
          online={stats.online}
          offline={stats.offline}
          unknown={stats.unknown}
          totalStorage={stats.totalStorage}
          networkHealth={networkHealth}
          reputationById={reputationById}
          regionStats={regionStats}
        />
        <RightDetailsPanel
          selected={activeNode}
          health={activeHealth}
          reputation={activeReputation}
          why={explainability?.why}
          predictions={explainability?.predictions}
        />
        <BottomLegend />

        <div className="top-right-status">
          <button
            type="button"
            className="ghost-toggle"
            onClick={() => setShowArcs((v) => !v)}
          >
            Arcs: {showArcs ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="ghost-toggle"
            onClick={() => setHeatmapMode((v) => !v)}
          >
            Heatmap: {heatmapMode ? "On" : "Off"}
          </button>
          {loading && <span className="badge">Syncing /api/pnodes…</span>}
          {error && <span className="badge badge-error">API error: {error}</span>}
          {!loading && !error && (
            <span className="badge badge-ok">
              {stats.total} node{stats.total === 1 ? "" : "s"} • feed live
            </span>
          )}
        </div>

        {failures.partitionSuspected && (
          <div className="partition-banner">
            <span className="dot dot-red" />
            <span className="partition-text">
              Partition suspected —{" "}
              {failures.partitionReason ?? "abnormal gossip pattern detected"}
            </span>
          </div>
        )}

        {timeMode !== "live" && (
          <div className="time-travel-bar">
            <span className="time-travel-label">
              Time Travel {isSyntheticHistory ? "(synthetic replay)" : ""}
            </span>
            <div className="time-travel-controls">
              <button
                type="button"
                className={`time-mode-btn ${
                  timeMode === "1h" ? "time-mode-btn-active" : ""
                }`}
                onClick={() => setTimeMode("1h")}
              >
                1h
              </button>
              <button
                type="button"
                className={`time-mode-btn ${
                  timeMode === "24h" ? "time-mode-btn-active" : ""
                }`}
                onClick={() => setTimeMode("24h")}
              >
                24h
              </button>
              <button
                type="button"
                className={`time-mode-btn ${
                  timeMode === "7d" ? "time-mode-btn-active" : ""
                }`}
                onClick={() => setTimeMode("7d")}
              >
                7d
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(availableSnapshots.length - 1, 0)}
                value={Math.min(timeIndex, Math.max(availableSnapshots.length - 1, 0))}
                onChange={(e) => setTimeIndex(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <div className="time-mode-toggle">
          <button
            type="button"
            className={`time-mode-pill ${
              timeMode === "live" ? "time-mode-pill-active" : ""
            }`}
            onClick={() => setTimeMode("live")}
          >
            Live
          </button>
          <button
            type="button"
            className={`time-mode-pill ${
              timeMode !== "live" ? "time-mode-pill-active" : ""
            }`}
            onClick={() => {
              setTimeMode("1h");
              setTimeIndex(0);
            }}
          >
            Time Travel
          </button>
        </div>

        <div className="rep-filter-bar">
          <button
            type="button"
            className={`rep-filter-btn ${
              reputationFilter === "all" ? "rep-filter-btn-active" : ""
            }`}
            onClick={() => setReputationFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`rep-filter-btn ${
              reputationFilter === "gold" ? "rep-filter-btn-active" : ""
            }`}
            onClick={() => setReputationFilter("gold")}
          >
            Gold
          </button>
          <button
            type="button"
            className={`rep-filter-btn ${
              reputationFilter === "silver" ? "rep-filter-btn-active" : ""
            }`}
            onClick={() => setReputationFilter("silver")}
          >
            Silver
          </button>
          <button
            type="button"
            className={`rep-filter-btn ${
              reputationFilter === "risky" ? "rep-filter-btn-active" : ""
            }`}
            onClick={() => setReputationFilter("risky")}
          >
            Risky
          </button>
        </div>
      </main>
    </div>
  );
};

export default App;


