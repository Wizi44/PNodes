import type { PNode, PNodeApiResponse } from "./types";

/**
 * Fetch pNode data from the backend.
 * Expects an endpoint at /api/pnodes returning:
 * { nodes: PNode[], updatedAt?: string }
 */
export async function fetchPNodes(): Promise<PNode[]> {
  const res = await fetch("/api/pnodes");

  if (!res.ok) {
    throw new Error(`Failed to fetch /api/pnodes: ${res.status}`);
  }

  const json = (await res.json()) as PNodeApiResponse | PNode[];

  if (Array.isArray(json)) return json;
  if (Array.isArray(json.nodes)) return json.nodes;

  throw new Error("Unexpected /api/pnodes response shape");
}


