// Simple pRPC client helper.
// Adjust the request shape here if your pNode expects a different payload.

let nextId = 1;

/**
 * Call a pNode pRPC method.
 *
 * @param {string} endpoint - Base URL for the pNode pRPC endpoint (e.g. "http://127.0.0.1:8899").
 * @param {string} method - pRPC method name, e.g. "pnode.gossipPeers".
 * @param {object} [params] - Optional params object (if required by the method).
 * @returns {Promise<any>} - The decoded "result" from the pRPC call.
 */
export async function callPRPC(endpoint, method, params = {}) {
  const id = nextId++;

  const payload = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${endpoint}`);
  }

  const data = await res.json();

  if (data.error) {
    const msg = data.error.message || JSON.stringify(data.error);
    throw new Error(`pRPC error from ${endpoint}: ${msg}`);
  }

  return data.result;
}


