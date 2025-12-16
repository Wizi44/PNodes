import React, { useMemo } from "react";
import type { PNode } from "../types";
import type { HealthDetails, ReputationDetails, ReputationTier } from "../health";

interface LeftStatsPanelProps {
  total: number;
  online: number;
  offline: number;
  unknown: number;
  totalStorage: number;
  networkHealth: number;
  reputationById?: Map<string, ReputationDetails>;
  regionStats?: Map<string, import("../partitions").RegionStats>;
}

export const LeftStatsPanel: React.FC<LeftStatsPanelProps> = ({
  total,
  online,
  offline,
  unknown,
  totalStorage,
  networkHealth,
  reputationById,
  regionStats,
}) => {
  const onlinePct = total ? Math.round((online / total) * 100) : 0;
  const networkHealthPct = Math.round((networkHealth || 0) * 100);

  const topReputation = useMemo(() => {
    if (!reputationById) return [];
    const entries = Array.from(reputationById.entries());
    entries.sort((a, b) => b[1].score - a[1].score);
    return entries.slice(0, 3);
  }, [reputationById]);

  const topRegions = useMemo(() => {
    if (!regionStats) return [];
    const entries = Array.from(regionStats.entries());
    entries.sort((a, b) => b[1].total - a[1].total);
    return entries.slice(0, 3);
  }, [regionStats]);

  return (
    <div className="floating-panel floating-panel-left">
      <div className="panel-title">Network Pulse</div>
      <div className="health-ring-wrapper">
        <div
          className="health-ring"
          aria-label={`Gossip health ${networkHealthPct}%`}
        >
          <div className="health-ring-inner">
            <span className="health-percent">{networkHealthPct}%</span>
            <span className="health-label">Gossip Health</span>
          </div>
          <div
            className="health-ring-fill"
            style={{
              backgroundImage: `conic-gradient(#22c55e ${networkHealthPct * 3.6}deg, rgba(148, 163, 184, 0.35) ${networkHealthPct * 3.6}deg)`,
            }}
          />
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-tile">
          <div className="stat-label">Total pNodes</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">
            Online <span className="dot dot-green" />
          </div>
          <div className="stat-value">
            {online}{" "}
            <span className="stat-sub">({onlinePct}%)</span>
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">
            Unknown <span className="dot dot-yellow" />
          </div>
          <div className="stat-value">{unknown}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-label">
            Offline <span className="dot dot-red" />
          </div>
          <div className="stat-value">{offline}</div>
        </div>
        <div className="stat-tile stat-wide">
          <div className="stat-label">Storage Used</div>
          <div className="stat-value">
            {(totalStorage / 1_000_000_000_000).toFixed(2)}{" "}
            <span className="stat-sub">TB</span>
          </div>
        </div>
        {topReputation.length > 0 && (
          <div className="stat-tile stat-wide">
            <div className="stat-label">Top Reputation</div>
            <div className="leaderboard">
              {topReputation.map(([id, rep]) => (
                <div key={id} className="leader-row">
                  <span className={`rep-badge rep-${rep.tier}`}>
                    {rep.tier === "gold" ? "Gold" : rep.tier === "silver" ? "Silver" : "Risky"}
                  </span>
                  <span className="leader-id mono">
                    {id.slice(0, 6)}…{id.slice(-4)}
                  </span>
                  <span className="leader-score">{Math.round(rep.score * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {topRegions.length > 0 && (
          <div className="stat-tile stat-wide">
            <div className="stat-label">Region Load</div>
            <div className="leaderboard">
              {topRegions.map(([region, rs]) => (
                <div key={region} className="leader-row">
                  <span className="leader-id">{region}</span>
                  <span className="leader-score">
                    {rs.online}/{rs.total} online
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface RightDetailsPanelProps {
  selected: PNode | null;
  health?: HealthDetails;
  reputation?: ReputationDetails;
  why?: string[];
  predictions?: { message: string; confidence: "low" | "medium" | "high" }[];
}

export const RightDetailsPanel: React.FC<RightDetailsPanelProps> = ({
  selected,
  health,
  reputation,
  why,
  predictions,
}) => {
  return (
    <div className="floating-panel floating-panel-right">
      <div className="panel-title">pNode Insight</div>
      {!selected ? (
        <div className="panel-placeholder">
          Tap any node on the globe to view deep metrics.
        </div>
      ) : (
        <div className="details-layout">
          <div className="detail-row">
            <div className="detail-label">pNode ID</div>
            <div className="detail-value mono">{selected.pnodeId}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Status</div>
            <div className="detail-value">
              <span className={`badge-status badge-${selected.status}`}>
                {selected.status.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Geo</div>
            <div className="detail-value">
              <span className="mono">
                {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
              </span>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Storage</div>
            <div className="detail-value">
              {(selected.storageUsed / 1_000_000_000).toFixed(2)}{" "}
              <span className="stat-sub">GB</span>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Version</div>
            <div className="detail-value mono">{selected.version}</div>
          </div>
          <div className="detail-row">
            <div className="detail-label">Last Seen</div>
            <div className="detail-value">
              {new Date(selected.lastSeen).toLocaleString()}
            </div>
          </div>
          {health && (
            <>
              <div className="detail-row">
                <div className="detail-label">Gossip Health</div>
                <div className="detail-value">
                  <span className={`badge-status badge-health-${health.tier}`}>
                    {(health.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="detail-row">
                <div className="detail-label">Why</div>
                <div className="detail-value detail-reasons">
                  {health.reasons.map((r) => (
                    <div key={r} className="reason-line">
                      • {r}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {reputation && (
            <div className="detail-row">
              <div className="detail-label">Reputation</div>
              <div className="detail-value">
                <span className={`rep-badge rep-${reputation.tier}`}>
                  {reputation.tier === "gold"
                    ? "Gold"
                    : reputation.tier === "silver"
                    ? "Silver"
                    : "Risky"}
                </span>
                <span className="stat-sub">
                  {" "}
                  {Math.round(reputation.score * 100)} / 100
                </span>
              </div>
            </div>
          )}
          {why && why.length > 0 && (
            <div className="detail-row detail-row-column">
              <div className="detail-label">Why</div>
              <div className="detail-value detail-reasons">
                {why.map((line) => (
                  <div key={line} className="reason-line">
                    • {line}
                  </div>
                ))}
              </div>
            </div>
          )}
          {predictions && predictions.length > 0 && (
            <div className="detail-row detail-row-column">
              <div className="detail-label">Predictions</div>
              <div className="detail-value detail-reasons">
                {predictions.map((p) => (
                  <div key={p.message} className="prediction-line">
                    <div>{p.message}</div>
                    <div className={`confidence-bar confidence-${p.confidence}`}>
                      <span>{p.confidence.toUpperCase()} confidence</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface LegendProps {}

export const BottomLegend: React.FC<LegendProps> = () => {
  return (
    <div className="legend-bar">
      <div className="legend-item">
        <span className="dot dot-green" />
        <span>Online</span>
      </div>
      <div className="legend-item">
        <span className="dot dot-yellow" />
        <span>Unknown</span>
      </div>
      <div className="legend-item">
        <span className="dot dot-red" />
        <span>Offline</span>
      </div>
      <div className="legend-spacer" />
      <div className="legend-brand">
        Xandeum pNode Globe • v0.1
      </div>
    </div>
  );
};


