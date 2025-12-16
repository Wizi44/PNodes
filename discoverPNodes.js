import { callPRPC } from "./prpcClient.js";

/**
 * Discover pNodes that appear in gossip from a list of seed nodes.
 *
 * @param {string[]} seedNodes - Array of pRPC endpoints to query.
 * @returns {Promise<object[]>} - Array of unique pNodes discovered via gossip.
 */
export async function discoverPNodes(seedNodes) {
  const discovered = new Map();

  for (const seed of seedNodes) {
    const trimmed = seed.trim();
    if (!trimmed) continue;

    try {
      const gossip = await callPRPC(trimmed, "pnode.gossipPeers");

      if (!Array.isArray(gossip)) {
        console.warn(`Unexpected gossip shape from ${trimmed}`, gossip);
        continue;
      }

      gossip.forEach((peer) => {
        const key = peer.pnodeId || peer.id || JSON.stringify(peer);
        const existing = discovered.get(key);

        const record = {
          ...peer,
          discoveredFrom: trimmed,
          lastSeen: Date.now(),
        };

        // Prefer the earliest discoveredFrom if this peer already exists.
        if (!existing) {
          discovered.set(key, record);
        } else {
          discovered.set(key, {
            ...existing,
            ...record,
          });
        }
      });
    } catch (err) {
      console.error(`Failed gossip from ${seed}`, err.message || err);
    }
  }

  return Array.from(discovered.values());
}


