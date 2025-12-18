## Data Model & Derived Metrics

### Base pNode Shape

The frontend expects `/api/pnodes` to return objects like:

- `pnodeId: string`
- `latitude: number`
- `longitude: number`
- `status: "online" | "unknown" | "offline"`
- `storageUsed: number` (bytes)
- `version: string`
- `lastSeen: string | number`

Optional fields (used when present):

- `peers_seen` / `peersSeen: number`
- `peer_diversity` / `peerDiversity: number (0–1)`
- `response_latency` / `responseLatency: number (ms)`
- `uptime` / `uptime_ratio` / `uptimeRatio: number (0–1)`
- `data_availability` / `dataAvailability* : number (0–1)`
- `version_freshness: number (0–1)`

### Derived Metrics

- **Health score**: Short-term gossip health (status, peers, diversity, latency, uptime, availability, freshness).
- **Network health**: Average of node health scores.
- **Reputation score / tier**: Longer-lived signal biased toward uptime + storage reliability, plus responsiveness and version freshness (Gold/Silver/Risky).
- **Failures / anomalies**: sudden drops, regional isolation, gossip black holes, and partition suspicion.
- **Region stats**: coarse 10° lat/lon buckets with total/online/offline counts.


