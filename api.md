## Backend API Contract – `/api/pnodes`

The frontend expects a single HTTP endpoint:

- **Method**: `GET`
- **Path**: `/api/pnodes`
- **Response**:
  - Either: `PNode[]`
  - Or: `{ nodes: PNode[], updatedAt?: string }`

See `data-model.md` for the `PNode` shape and optional analytics fields.

### Polling / Real-Time

- The client polls this endpoint every **30 seconds**.
- If you later expose a WebSocket / SSE stream, you can:
  - Keep the `/api/pnodes` contract for initial state.
  - Push incremental updates that the frontend can fold into its snapshots (not yet implemented, but planned).

### Future pRPC Integration

This app currently assumes a backend service that:

- Talks to Xandeum pNodes via pRPC (e.g., `pnode.gossipPeers`).
- Aggregates network-wide pNode data.
- Serves a normalized `/api/pnodes` JSON view for the frontend.

You can evolve the backend independently as long as the `/api/pnodes` contract stays compatible.


