## Frontend Architecture

**Stack**: React + TypeScript + Vite, with `@react-three/fiber`, `@react-three/drei`, and `three` for the globe.

### High-Level Flow

1. `usePNodeData` fetches `/api/pnodes` every 30 seconds.
2. Each fetch updates:
   - Current node list.
   - Snapshots for time-travel.
   - Per-node health and reputation.
   - Failure and partition analysis.
   - Region-level stats.
3. `App` combines this into:
   - `GlobeScene` props (nodes, health, anomalies, heatmap mode).
   - Left/Right panels (stats, insight, explainability).
   - Filters (time travel, arcs, heatmap, reputation tier).

### Core Components

- `GlobeScene` – 3D canvas, globe, instanced node markers, arcs, auto-rotation, and heatmap mode.
- `Panels` – left stats panel, right insight panel, bottom legend.
- `hooks` – data fetching, polling, and derived metrics.
- `health`, `partitions`, `explain` – pure computation modules (no React) for analytics and explainability.


