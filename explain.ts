import type { PNode } from "./types";
import type { HealthDetails, ReputationDetails } from "./health";
import type { FailureAnalysis } from "./partitions";
import type { PNodeSnapshot } from "./hooks";

export interface Prediction {
  message: string;
  confidence: "low" | "medium" | "high";
}

export interface Explainability {
  why: string[];
  predictions: Prediction[];
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function buildNodeExplainability(
  node: PNode,
  health: HealthDetails | undefined,
  reputation: ReputationDetails | undefined,
  failures: FailureAnalysis,
  snapshots: PNodeSnapshot[],
  allNodes: PNode[]
): Explainability {
  const why: string[] = [];
  const predictions: Prediction[] = [];

  if (node.status === "offline") {
    why.push("This node is currently marked offline in gossip.");
  } else if (node.status === "unknown") {
    why.push("This node has an unknown status and may not be consistently reachable.");
  } else {
    why.push("This node is currently online and participating in gossip.");
  }

  const anomalies = failures.anomaliesById.get(node.pnodeId) ?? [];
  if (anomalies.includes("sudden_drop")) {
    why.push("It recently dropped from gossip after being online (sudden peer drop).");
  }
  if (anomalies.includes("isolated")) {
    why.push("Low gossip reach due to regional clustering or isolation.");
  }
  if (anomalies.includes("black_hole")) {
    why.push("Behaves like a gossip black hole: stale last seen, low peers, or low data availability.");
  }

  if (health) {
    health.reasons.forEach((r) => {
      if (!why.includes(r)) why.push(r);
    });
  }

  if (reputation) {
    if (reputation.tier === "gold") {
      why.push("Long‑lived uptime and storage reliability give this node a Gold reputation.");
    } else if (reputation.tier === "silver") {
      why.push("Solid but imperfect track record, classified as Silver reputation.");
    } else {
      why.push("Risky reputation: uptime, responsiveness, or storage reliability trail peers.");
    }
  }

  // Compare storage to peers.
  const peerStorage = allNodes.map((n) => n.storageUsed || 0);
  const avgStorage = avg(peerStorage);
  if (avgStorage > 0 && node.storageUsed > avgStorage * 1.5) {
    why.push("Storage usage is significantly higher than peer average.");
  }

  // Simple trend analysis on lastSeen recency over snapshots.
  const nodeSnapshots = snapshots
    .slice(-20)
    .map((s) => s.nodes.find((n) => n.pnodeId === node.pnodeId))
    .filter((n): n is PNode => !!n);

  const ages = nodeSnapshots.map((n) => {
    const ts = new Date(n.lastSeen).getTime();
    return Number.isNaN(ts) ? Infinity : (Date.now() - ts) / 1000;
  });

  if (ages.length >= 3) {
    const recent = ages.slice(-3);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (last > first * 1.4) {
      predictions.push({
        message: "Node is drifting out of recent gossip; likely to go offline within ~2h if trend continues.",
        confidence: "medium",
      });
    }
  }

  const uptime =
    (node as any).uptime ?? (node as any).uptime_ratio ?? (node as any).uptimeRatio;
  if (typeof uptime === "number" && uptime < 0.7) {
    predictions.push({
      message: "Low historical uptime; expect intermittent availability or further drops.",
      confidence: "high",
    });
  }

  const dataAvailability =
    (node as any).data_availability ??
    (node as any).dataAvailability ??
    (node as any).dataAvailabilityRatio;
  if (typeof dataAvailability === "number" && dataAvailability < 0.6) {
    predictions.push({
      message: "Storage underperforming compared to peers; saturation or reliability risk.",
      confidence: "medium",
    });
  }

  return { why, predictions };
}


