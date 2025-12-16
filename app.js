import { discoverPNodes } from "./discoverPNodes.js";

const seedTextarea = document.getElementById("seed-nodes");
const form = document.getElementById("discovery-form");
const statusEl = document.getElementById("status");
const countBadge = document.getElementById("count-badge");
const tbody = document.getElementById("pnodes-tbody");
const discoverBtn = document.getElementById("discover-btn");
const refreshBtn = document.getElementById("refresh-btn");

let lastSeedList = [];
let currentResults = [];
let isBusy = false;

function setBusy(busy, message = "") {
  isBusy = busy;
  discoverBtn.disabled = busy;
  refreshBtn.disabled = busy || lastSeedList.length === 0;
  statusEl.textContent = message;
}

function parseSeedNodes() {
  const lines = seedTextarea.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

function extractHostFromPeer(peer) {
  const addr = peer.gossipAddr || peer.addr;
  if (!addr) return null;
  // Handle host:port, [ipv6]:port, or plain host
  const noProto = addr.replace(/^https?:\/\//i, "");
  // If wrapped in [], take inside for ipv6
  const hostPort = noProto.split("/")[0];
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    return end > 1 ? hostPort.slice(1, end) : null;
  }
  const [host] = hostPort.split(":");
  return host || null;
}

async function enrichWithGeo(peers) {
  try {
    const ips = Array.from(
      new Set(
        peers
          .map(extractHostFromPeer)
          .filter(Boolean)
      )
    );

    if (!ips.length) return peers;

    const url =
      "https://ip-api.com/batch?fields=status,message,query,country,countryCode,city,lat,lon";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ips),
    });

    if (!res.ok) {
      console.warn("ip-api.com batch returned HTTP", res.status);
      return peers;
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      console.warn("Unexpected ip-api.com batch response", data);
      return peers;
    }

    const geoByIp = new Map();
    data.forEach((row, idx) => {
      const ip = ips[idx];
      if (!ip) return;
      geoByIp.set(ip, row);
    });

    return peers.map((peer) => {
      const ip = extractHostFromPeer(peer);
      const geo = ip ? geoByIp.get(ip) : null;
      if (!geo || geo.status !== "success") {
        return peer;
      }

      const geoLabelParts = [];
      if (geo.city) geoLabelParts.push(geo.city);
      if (geo.countryCode) geoLabelParts.push(geo.countryCode);

      return {
        ...peer,
        geoIp: geo.query,
        geoCity: geo.city,
        geoCountry: geo.country,
        geoCountryCode: geo.countryCode,
        geoLat: geo.lat,
        geoLon: geo.lon,
        geoLabel: geoLabelParts.join(", "),
      };
    });
  } catch (e) {
    console.warn("ip-api.com batch lookup failed, skipping geo enrichment:", e);
    return peers;
  }
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function updateCountBadge() {
  const n = currentResults.length;
  countBadge.textContent = n === 1 ? "1 node" : `${n} nodes`;
}

function renderTable() {
  tbody.innerHTML = "";

  if (!currentResults.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "No pNodes discovered yet. Run a discovery from one or more seed nodes.";
    tbody.appendChild(tr);
    tr.appendChild(td);
    return;
  }

  currentResults.forEach((peer) => {
    const tr = document.createElement("tr");

    // pNode ID
    const idTd = document.createElement("td");
    idTd.className = "small-mono";
    idTd.textContent =
      peer.pnodeId || peer.id || peer.identity || "(unknown id)";
    tr.appendChild(idTd);

    // Address / gossip info
    const addrTd = document.createElement("td");
    const addrParts = [];
    if (peer.gossipAddr) addrParts.push(peer.gossipAddr);
    if (peer.gossipPort) addrParts.push(`:${peer.gossipPort}`);
    const label = addrParts.join("") || peer.addr || "";
    const metaSpan = document.createElement("span");
    metaSpan.className = "pill";
    metaSpan.textContent = label || "gossip peer";
    addrTd.appendChild(metaSpan);

    if (peer.geoLabel) {
      const geoSpan = document.createElement("div");
      geoSpan.className = "small-mono";
      geoSpan.textContent = peer.geoLabel;
      addrTd.appendChild(geoSpan);
    }
    tr.appendChild(addrTd);

    // Discovered from
    const fromTd = document.createElement("td");
    fromTd.className = "small-mono";
    fromTd.textContent = peer.discoveredFrom || "";
    tr.appendChild(fromTd);

    // Last seen
    const lastSeenTd = document.createElement("td");
    lastSeenTd.textContent = formatTimestamp(peer.lastSeen);
    tr.appendChild(lastSeenTd);

    // Raw JSON
    const rawTd = document.createElement("td");
    const pre = document.createElement("pre");
    pre.className = "raw-json";
    pre.textContent = JSON.stringify(peer, null, 2);
    rawTd.appendChild(pre);
    tr.appendChild(rawTd);

    tbody.appendChild(tr);
  });
}

async function runDiscovery(fromRefresh = false) {
  const seeds = fromRefresh ? lastSeedList : parseSeedNodes();
  if (!seeds.length) {
    statusEl.textContent = "Enter at least one seed pNode endpoint.";
    return;
  }

  lastSeedList = seeds;
  setBusy(true, "Discovering gossip peers from seed nodes…");

  try {
    const discovered = await discoverPNodes(seeds);
    currentResults = await enrichWithGeo(discovered);
    updateCountBadge();
    renderTable();
    setBusy(false, `Discovery complete from ${seeds.length} seed node(s).`);
  } catch (err) {
    console.error(err);
    setBusy(false, `Error during discovery: ${err.message || err}`);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (isBusy) return;
  runDiscovery(false);
});

refreshBtn.addEventListener("click", () => {
  if (isBusy) return;
  runDiscovery(true);
});

// Initial state
renderTable();
updateCountBadge();
setBusy(false, "Ready. Enter seed pNode endpoints to begin discovery.");


