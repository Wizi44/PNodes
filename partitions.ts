import type { PNode } from "./types";
import type { PNodeSnapshot } from "./hooks";

export type NodeAnomaly = "sudden_drop" | "isolated" | "black_hole";

export interface FailureAnalysis {
  anomaliesById: Map<string, NodeAnomaly[]>;
  partitionSuspected: boolean;
  partitionReason: string | null;
}

export interface RegionStats {
  total: number;
  online: number;
  offline: number;
}

export function getRegionKey(node: PNode): string {
  // Coarse bucket by latitude/longitude for "region".
  const latBucket = Math.round(node.latitude / 10) * 10;
  const lonBucket = Math.round(node.longitude / 10) * 10;
  return `${latBucket}:${lonBucket}`;
}

export function computeRegionStats(
  nodes: PNode[]
): Map<string, RegionStats> {
  const regionTotals = new Map<string, RegionStats>();
  nodes.forEach((n) => {
    const key = getRegionKey(n);
    const stats = regionTotals.get(key) ?? { total: 0, offline: 0, online: 0 };
    stats.total += 1;
    if (n.status === "offline") stats.offline += 1;
    if (n.status === "online") stats.online += 1;
    regionTotals.set(key, stats);
  });
  return regionTotals;
}

export function analyzeFailures(
  snapshots: PNodeSnapshot[],
  currentNodes: PNode[]
): FailureAnalysis {
  const anomaliesById = new Map<string, NodeAnomaly[]>();
  if (!currentNodes.length) {
    return { anomaliesById, partitionSuspected: false, partitionReason: null };
  }

  const latestSnap = snapshots[snapshots.length - 1];
  const prevSnap = snapshots[snapshots.length - 2];

  const currentById = new Map(currentNodes.map((n) => [n.pnodeId, n]));
  const prevById = prevSnap
    ? new Map(prevSnap.nodes.map((n) => [n.pnodeId, n]))
    : new Map<string, PNode>();

  const ageMs = (n: PNode) => {
    const ts = new Date(n.lastSeen).getTime();
    if (Number.isNaN(ts)) return Infinity;
    return Date.now() - ts;
  };

  const TEN_MIN = 10 * 60 * 1000;

  // Detect sudden drops: node was present and online in prev snapshot, now offline or gone.
  if (prevSnap && latestSnap) {
    prevSnap.nodes.forEach((prev) => {
      const now = currentById.get(prev.pnodeId);
      const wasOnline = prev.status === "online";
      const isNowMissing = !now;
      const isNowOffline = now && now.status === "offline";
      if (wasOnline && (isNowMissing || isNowOffline)) {
        const list = anomaliesById.get(prev.pnodeId) ?? [];
        list.push("sudden_drop");
        anomaliesById.set(prev.pnodeId, list);
      }
    });
  }

  // Region statistics for geographic isolation / outages.
  const regionTotals = new Map<string, { total: number; offline: number }>();
  currentNodes.forEach((n) => {
    const key = getRegionKey(n);
    const stats = regionTotals.get(key) ?? { total: 0, offline: 0 };
    stats.total += 1;
    if (n.status === "offline") stats.offline += 1;
    regionTotals.set(key, stats);
  });

  const isolatedRegions: string[] = [];
  regionTotals.forEach((v, key) => {
    if (v.total >= 5 && v.offline / v.total >= 0.6) {
      isolatedRegions.push(key);
    }
  });

  // Mark nodes in heavily affected regions as "isolated".
  if (isolatedRegions.length) {
    currentNodes.forEach((n) => {
      if (!isolatedRegions.includes(getRegionKey(n))) return;
      const list = anomaliesById.get(n.pnodeId) ?? [];
      if (!list.includes("isolated")) {
        list.push("isolated");
        anomaliesById.set(n.pnodeId, list);
      }
    });
  }

  // Gossip black holes: very old lastSeen or obviously bad availability/peers (if provided).
  currentNodes.forEach((n) => {
    const peersSeen = (n as any).peers_seen ?? (n as any).peersSeen ?? 0;
    const dataAvailability =
      (n as any).data_availability ??
      (n as any).dataAvailability ??
      (n as any).dataAvailabilityRatio ??
      1;

    const tooOld = ageMs(n) > TEN_MIN;
    const tooFewPeers = peersSeen < 2;
    const poorAvailability = dataAvailability < 0.5;

    if (tooOld || tooFewPeers || poorAvailability) {
      const list = anomaliesById.get(n.pnodeId) ?? [];
      if (!list.includes("black_hole")) {
        list.push("black_hole");
        anomaliesById.set(n.pnodeId, list);
      }
    }
  });

  // Global partition suspicion heuristics.
  let partitionSuspected = false;
  let partitionReason: string | null = null;

  const offlineCount = currentNodes.filter((n) => n.status === "offline").length;
  const onlineCount = currentNodes.filter((n) => n.status === "online").length;
  const total = currentNodes.length;

  const manySuddenDrops = Array.from(anomaliesById.values()).filter((arr) =>
    arr.includes("sudden_drop")
  ).length;

  if (isolatedRegions.length) {
    partitionSuspected = true;
    partitionReason = "Region outage or isolation in " + isolatedRegions.join(", ");
  } else if (manySuddenDrops > 0 && manySuddenDrops / total > 0.2) {
    partitionSuspected = true;
    partitionReason = "Large set of peers dropped from gossip abruptly";
  } else if (offlineCount > onlineCount) {
    partitionSuspected = true;
    partitionReason = "Majority of pNodes appear offline or unreachable";
  }

  // Bonus: simplistic probable cause hints.
  if (partitionSuspected && !partitionReason) {
    const versions = new Map<string, number>();
    currentNodes.forEach((n) => {
      const v = n.version || "unknown";
      versions.set(v, (versions.get(v) ?? 0) + 1);
    });
    const dominant = Array.from(versions.entries()).sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[0] !== "unknown" && dominant[1] / total > 0.5) {
      partitionReason = `Version skew risk: most nodes report version ${dominant[0]}`;
    } else {
      partitionReason = "Latency spike or upstream network instability suspected";
    }
  }

  return { anomaliesById, partitionSuspected, partitionReason };
}


