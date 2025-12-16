import type { PNode } from "./types";

export interface HealthDetails {
  /** 0–1, where 1 is perfect health. */
  score: number;
  /** Convenience tier for UI. */
  tier: "good" | "warning" | "bad";
  /** Short human-readable reasons that can be shown in a tooltip. */
  reasons: string[];
}

export type ReputationTier = "gold" | "silver" | "risky";

export interface ReputationDetails {
  /** 0–1 reputation score. */
  score: number;
  tier: ReputationTier;
}

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}


export function computeNodeHealth(node: PNode): HealthDetails {
  const reasons: string[] = [];

 
  const peersSeen = (node as any).peers_seen ?? (node as any).peersSeen ?? 0;
  const peerDiversity = (node as any).peer_diversity ?? (node as any).peerDiversity ?? 0;
  const responseLatency = (node as any).response_latency ?? (node as any).responseLatency ?? null;
  const uptime = (node as any).uptime ?? (node as any).uptime_ratio ?? (node as any).uptimeRatio;
  const dataAvailability =
    (node as any).data_availability ??
    (node as any).dataAvailability ??
    (node as any).dataAvailabilityRatio;

  // peers_seen: more is better, but with diminishing returns.
  const peersScore = clamp01(Math.log10(1 + peersSeen) / 2);
  if (peersSeen < 3) reasons.push("Low peer count in gossip");

  // peer_diversity: 0–1, where 1 means highly diverse.
  const diversityScore = clamp01(peerDiversity || 0.5);
  if (diversityScore < 0.4) reasons.push("Peers lack geographic / ASN diversity");

  // response_latency: lower is better; assume ms.
  let latencyScore = 0.7;
  if (responseLatency != null) {
    const ms = Number(responseLatency);
    if (!Number.isNaN(ms)) {
      // 50ms = great, 500ms = poor
      const norm = clamp01(1 - (ms - 50) / 450);
      latencyScore = norm;
      if (ms > 350) reasons.push("High gossip response latency");
    }
  }

  // uptime: 0–1.
  const uptimeScore = clamp01(uptime ?? 0.8);
  if (uptimeScore < 0.8) reasons.push("Uptime below target SLA");

  // data_availability: 0–1.
  const dataScore = clamp01(dataAvailability ?? 0.9);
  if (dataScore < 0.8) reasons.push("Data availability below network baseline");

  // lastSeen freshness: recent gossip is a strong indicator.
  const lastSeenMs = Number(new Date(node.lastSeen));
  let freshnessScore = 0.5;
  if (!Number.isNaN(lastSeenMs)) {
    const ageSec = (Date.now() - lastSeenMs) / 1000;
    const horizon = 10 * 60; // 10 minutes
    freshnessScore = clamp01(1 - ageSec / horizon);
    if (ageSec > horizon) reasons.push("Not seen in recent gossip window");
  }

  // Base on status (online/unknown/offline) as a coarse prior.
  const statusBase =
    node.status === "online" ? 0.9 : node.status === "unknown" ? 0.6 : 0.2;

  // Weighted blend of all dimensions.
  const score = clamp01(
    statusBase * 0.25 +
      peersScore * 0.15 +
      diversityScore * 0.15 +
      latencyScore * 0.15 +
      uptimeScore * 0.15 +
      dataScore * 0.1 +
      freshnessScore * 0.05
  );

  let tier: HealthDetails["tier"] = "good";
  if (score < 0.4) tier = "bad";
  else if (score < 0.7) tier = "warning";

  if (reasons.length === 0 && tier === "good") {
    reasons.push("Healthy gossip connectivity and recent activity");
  }

  return { score, tier, reasons };
}

export function computeNetworkHealth(nodes: PNode[]): number {
  if (!nodes.length) return 0;
  const sum = nodes.reduce((acc, n) => acc + computeNodeHealth(n).score, 0);
  return sum / nodes.length;
}

/**
 * Reputation: long-lived signal combining uptime + storage reliability + responsiveness + freshness.
 * This is intentionally similar to health but with different weights and tiers mapped to Gold/Silver/Risky.
 */
export function computeReputation(node: PNode, health: HealthDetails): ReputationDetails {
  const uptime = (node as any).uptime ?? (node as any).uptime_ratio ?? (node as any).uptimeRatio;
  const dataAvailability =
    (node as any).data_availability ??
    (node as any).dataAvailability ??
    (node as any).dataAvailabilityRatio;
  const responseLatency = (node as any).response_latency ?? (node as any).responseLatency ?? null;
  const versionFreshness = (node as any).version_freshness ?? 0.7;

  // Uptime and storage are weighted higher per your spec.
  const uptimeScore = clamp01(uptime ?? 0.8);
  const storageScore = clamp01(dataAvailability ?? 0.9);

  let latencyScore = 0.7;
  if (responseLatency != null) {
    const ms = Number(responseLatency);
    if (!Number.isNaN(ms)) {
      const norm = clamp01(1 - (ms - 50) / 450);
      latencyScore = norm;
    }
  }

  const freshnessScore = clamp01(versionFreshness);

  // Blend: uptime + storage (high), responsiveness + version (medium), health as guardrail.
  const raw = clamp01(
    uptimeScore * 0.35 +
      storageScore * 0.35 +
      latencyScore * 0.12 +
      freshnessScore * 0.12 +
      health.score * 0.06
  );

  let tier: ReputationTier = "silver";
  if (raw >= 0.8) tier = "gold";
  else if (raw < 0.5) tier = "risky";

  return { score: raw, tier };
}

