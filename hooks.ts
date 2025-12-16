import { useEffect, useState } from "react";
import { fetchPNodes } from "./api";
import type { PNode } from "./types";
import {
  computeNetworkHealth,
  computeNodeHealth,
  computeReputation,
  type HealthDetails,
  type ReputationDetails,
} from "./health";
import { analyzeFailures, computeRegionStats, type FailureAnalysis, type RegionStats } from "./partitions";

interface UsePNodeDataOptions {
  pollMs?: number;
}

export interface PNodeSnapshot {
  timestamp: number;
  nodes: PNode[];
  synthetic?: boolean;
}

export function usePNodeData(options: UsePNodeDataOptions = {}) {
  const { pollMs = 30_000 } = options;
  const [nodes, setNodes] = useState<PNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthById, setHealthById] = useState<Map<string, HealthDetails>>(new Map());
  const [reputationById, setReputationById] = useState<Map<string, ReputationDetails>>(
    new Map()
  );
  const [networkHealth, setNetworkHealth] = useState(0);
  const [snapshots, setSnapshots] = useState<PNodeSnapshot[]>([]);
  const [failures, setFailures] = useState<FailureAnalysis>({
    anomaliesById: new Map(),
    partitionSuspected: false,
    partitionReason: null,
  });
  const [regionStats, setRegionStats] = useState<Map<string, RegionStats>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchPNodes();
        if (!cancelled) {
          const now = Date.now();
          setNodes(data);
          const healthMap = new Map<string, HealthDetails>();
          const repMap = new Map<string, ReputationDetails>();
          data.forEach((n) => {
            const h = computeNodeHealth(n);
            healthMap.set(n.pnodeId, h);
            repMap.set(n.pnodeId, computeReputation(n, h));
          });
          setHealthById(healthMap);
          setReputationById(repMap);
          setNetworkHealth(computeNetworkHealth(data));

          // Append a real snapshot for time‑travel / replay.
          setSnapshots((prev) => {
            const next: PNodeSnapshot[] = [
              ...prev,
              { timestamp: now, nodes: data },
            ];
            // Keep a reasonable number in memory (e.g. last 500 fetches).
            return next.slice(-500);
          });

          setFailures(analyzeFailures(snapshots, data));
          setRegionStats(computeRegionStats(data));
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    if (pollMs > 0) {
      const id = setInterval(load, pollMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [pollMs]);

  const online = nodes.filter((n) => n.status === "online");
  const offline = nodes.filter((n) => n.status === "offline");

  const totalStorage = nodes.reduce((acc, n) => acc + (n.storageUsed || 0), 0);

  return {
    nodes,
    loading,
    error,
    healthById,
    reputationById,
    networkHealth,
    snapshots,
    failures,
    regionStats,
    stats: {
      total: nodes.length,
      online: online.length,
      offline: offline.length,
      unknown: nodes.length - online.length - offline.length,
      totalStorage,
    },
  };
}


