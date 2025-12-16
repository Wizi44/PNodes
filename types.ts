export type PNodeStatus = "online" | "unknown" | "offline";

export interface PNode {
  pnodeId: string;
  latitude: number;
  longitude: number;
  status: PNodeStatus;
  storageUsed: number;
  version: string;
  lastSeen: string | number;
}

export interface PNodeApiResponse {
  nodes: PNode[];
  updatedAt?: string;
}


