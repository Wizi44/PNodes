## Project Overview

The Xandeum pNode Globe Analytics project is a **web-based observability and analytics dashboard** for Xandeum pNodes, with a focus on:

- **3D globe visualization** of pNode locations and gossip presence.
- **Advanced gossip analytics** (health, partitions, black holes).
- **Reputation and risk scoring** for individual pNodes.
- **Time travel and replay** of historical gossip states.

### Key Concepts

- **pNode**: A Xandeum storage node participating in gossip and handling storage requests.
- **Gossip health**: A derived metric summarizing how well a node participates in the gossip mesh (freshness, reach, diversity, latency, availability).
- **Reputation**: A longer-lived score combining uptime, storage reliability, gossip responsiveness, and version freshness.
- **Failure & partition detection**: Heuristics that flag sudden peer drops, geographic isolation, and gossip black holes.


