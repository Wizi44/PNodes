import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Instances, Instance, QuadraticBezierLine } from "@react-three/drei";
import * as THREE from "three";
import type { PNode } from "../types";

const DEG2RAD = Math.PI / 180;

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

interface GlobeProps {
  nodes: PNode[];
  healthById?: Map<string, import("../health").HealthDetails>;
  anomaliesById?: Map<string, import("../partitions").NodeAnomaly[]>;
  onHoverNode: (node: PNode | null) => void;
  onSelectNode: (node: PNode) => void;
  heatmapMode?: boolean;
}

const statusColor = {
  online: new THREE.Color("#22c55e"),
  offline: new THREE.Color("#ef4444"),
  unknown: new THREE.Color("#eab308"),
};

const NodeInstances: React.FC<GlobeProps> = ({
  nodes,
  healthById,
  anomaliesById,
  onHoverNode,
  onSelectNode,
  heatmapMode,
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const temp = useMemo(() => new THREE.Object3D(), []);
  const colorArray = useMemo(() => new Float32Array(nodes.length * 3), [nodes.length]);
  const basePositions = useMemo(
    () => nodes.map((node) => latLonToVector3(node.latitude, node.longitude, 1.03)),
    [nodes]
  );

  const birthTimes = useRef<Map<string, number>>(new Map());

  const densityByIndex = useMemo(() => {
    if (!heatmapMode) return nodes.map(() => 1);
    const counts = new Map<string, number>();
    nodes.forEach((n) => {
      const key = `${Math.round(n.latitude / 10) * 10}:${Math.round(
        n.longitude / 10
      ) * 10}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return nodes.map((n) => {
      const key = `${Math.round(n.latitude / 10) * 10}:${Math.round(
        n.longitude / 10
      ) * 10}`;
      const c = counts.get(key) ?? 1;
      return 0.5 + Math.min(c / 20, 1.5);
    });
  }, [nodes, heatmapMode]);

  useMemo(() => {
    nodes.forEach((node, i) => {
      if (!birthTimes.current.has(node.pnodeId)) {
        birthTimes.current.set(node.pnodeId, performance.now());
      }

      const base = statusColor[node.status] ?? statusColor.unknown;

      const health = healthById?.get(node.pnodeId);
      const healthScalar = health ? 0.4 + 0.6 * health.score : 1;

      const anomalies = anomaliesById?.get(node.pnodeId) ?? [];
      const hasWarning = anomalies.includes("sudden_drop") || anomalies.includes("isolated");
      const hasBlackHole = anomalies.includes("black_hole");

      // Last-seen fade: older nodes become dimmer.
      const lastSeenMs = Number(new Date(node.lastSeen));
      const ageSec = Number.isNaN(lastSeenMs)
        ? Infinity
        : (Date.now() - lastSeenMs) / 1000;
      const fadeWindow = 10 * 60; // 10 minutes
      const freshness = Math.max(0, Math.min(1, 1 - ageSec / fadeWindow));

      let color = base.clone().multiplyScalar(healthScalar * (0.4 + 0.6 * freshness));

      // Warning halo tint: push toward amber/red for anomalies.
      if (hasWarning || hasBlackHole) {
        const warningColor = hasBlackHole
          ? new THREE.Color("#ef4444")
          : new THREE.Color("#facc15");
        color = color.lerp(warningColor, 0.5);
      }

      if (heatmapMode) {
        const density = densityByIndex[i] ?? 1;
        const hot = new THREE.Color("#f97316");
        const cool = new THREE.Color("#22c55e");
        const t = Math.max(0, Math.min(1, (density - 0.5) / 1.5));
        color = cool.lerp(hot, t);
      }

      const faded = color;
      faded.toArray(colorArray, i * 3);
    });

    if (ref.current) {
      const attr = new THREE.InstancedBufferAttribute(colorArray, 3);
      (ref.current.geometry as THREE.BufferGeometry).setAttribute("color", attr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, colorArray, birthTimes]);

  useFrame(() => {
    if (!ref.current) return;

    const now = performance.now();
    nodes.forEach((node, i) => {
      const position = basePositions[i];
      if (!position) return;

      const birth = birthTimes.current.get(node.pnodeId) ?? now;
      const t = Math.max(0, Math.min(1, (now - birth) / 600)); // ~0.6s grow-in
      const pulse = 0.9 + 0.2 * Math.sin(now / 500 + i);
      const heatScalar = heatmapMode ? (densityByIndex[i] ?? 1) : 1;
      const scale = (0.4 + 0.6 * t) * pulse * heatScalar * (heatmapMode ? 1.8 : 1);

      temp.position.copy(position);
      temp.scale.setScalar(scale);
      temp.lookAt(new THREE.Vector3(0, 0, 0));
      temp.updateMatrix();
      ref.current!.setMatrixAt(i, temp.matrix);
    });

    ref.current.instanceMatrix.needsUpdate = true;
  });

  const handlePointerMove = (e: any) => {
    e.stopPropagation();
    const idx = e.instanceId as number;
    if (idx == null) return;
    const node = nodes[idx];
    onHoverNode(node);
  };

  const handlePointerOut = () => {
    onHoverNode(null);
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    const idx = e.instanceId as number;
    if (idx == null) return;
    const node = nodes[idx];
    onSelectNode(node);
  };

  return (
    <Instances
      ref={ref}
      limit={Math.max(nodes.length, 1_000)}
      castShadow={false}
      receiveShadow={false}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <sphereGeometry args={[0.01, 8, 8]} />
      <meshBasicMaterial vertexColors transparent opacity={0.9} />
      {nodes.map((n) => (
        <Instance key={n.pnodeId} />
      ))}
    </Instances>
  );
};

interface ArcProps {
  start: THREE.Vector3;
  end: THREE.Vector3;
  weight: number;
  broken?: boolean;
}

const Arc: React.FC<ArcProps> = ({ start, end, weight, broken }) => {
  const ref = useRef<any>(null);

  const mid = useMemo(() => {
    const m = start.clone().add(end).multiplyScalar(0.5);
    m.normalize().multiplyScalar(1.25); // raise arc above globe
    return m;
  }, [start, end]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.dashOffset -= delta * 0.6;
  });

  return (
    <QuadraticBezierLine
      ref={ref}
      start={start}
      end={end}
      mid={mid}
      color={broken ? "#ef4444" : "#38bdf8"}
      linewidth={0.4 + weight * 0.9}
      transparent
      opacity={0.4}
      dashed
      dashScale={2}
      dashSize={0.25}
      gapSize={0.2}
    />
  );
};

const GlobeCore: React.FC = () => {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  return (
    <>
      {/* Earth core */}
      <mesh receiveShadow>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#020826"
          metalness={0.3}
          roughness={0.7}
          emissive="#0f172a"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Subtle longitude/latitude grid using wireframe */}
      <mesh>
        <sphereGeometry args={[1.001, 32, 32]} />
        <meshBasicMaterial
          color="#1d4ed8"
          wireframe
          transparent
          opacity={0.14}
        />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.08, 64, 64]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
        />
      </mesh>
    </>
  );
};

const AutoRotateController: React.FC = () => {
  const controls = useRef<any>(null);
  const { gl } = useThree();
  const [idle, setIdle] = useState(true);
  const idleTimeout = useRef<number | null>(null);

  useFrame(() => {
    if (controls.current) {
      controls.current.autoRotate = idle;
    }
  });

  const resetIdleTimer = () => {
    setIdle(false);
    if (idleTimeout.current != null) {
      window.clearTimeout(idleTimeout.current);
    }
    idleTimeout.current = window.setTimeout(() => {
      setIdle(true);
    }, 6000);
  };

  return (
    <OrbitControls
      ref={controls}
      args={[gl.camera, gl.domElement]}
      enablePan={false}
      enableZoom={true}
      zoomSpeed={0.6}
      rotateSpeed={0.5}
      autoRotate
      autoRotateSpeed={0.4}
      minDistance={2.2}
      maxDistance={4}
      enableDamping
      dampingFactor={0.08}
      onStart={resetIdleTimer}
      onEnd={resetIdleTimer}
    />
  );
};

interface GlobeSceneProps {
  nodes: PNode[];
  healthById?: Map<string, import("../health").HealthDetails>;
  anomaliesById?: Map<string, import("../partitions").NodeAnomaly[]>;
  onHoverNode: (node: PNode | null) => void;
  onSelectNode: (node: PNode) => void;
  showArcs?: boolean;
}

export const GlobeScene: React.FC<GlobeSceneProps> = ({
  nodes,
  healthById,
  anomaliesById,
  onHoverNode,
  onSelectNode,
  showArcs = true,
}) => {
  const arcDefs = useMemo(() => {
    const result: ArcProps[] = [];
    if (nodes.length < 2) return result;

    const positions = nodes.map((n) =>
      latLonToVector3(n.latitude, n.longitude, 1.05)
    );

    for (let i = 0; i < nodes.length; i++) {
      const start = positions[i];
      if (!start) continue;

      // Link each node to up to 2 "neighbors" to keep arc count manageable.
      const linkCount = 1 + (i % 2);
      for (let j = 1; j <= linkCount; j++) {
        const idx = (i + j * 7) % nodes.length;
        if (idx === i) continue;
        const end = positions[idx];
        if (!end) continue;
        const weight = 0.5 + ((i + idx) % 3) * 0.5; // synthetic weight: thicker = "frequent"
        const aStart = anomaliesById?.get(nodes[i].pnodeId) ?? [];
        const aEnd = anomaliesById?.get(nodes[idx].pnodeId) ?? [];
        const broken =
          aStart.includes("black_hole") ||
          aEnd.includes("black_hole") ||
          (aStart.includes("sudden_drop") && aEnd.includes("sudden_drop"));
        result.push({ start, end, weight, broken });
      }
    }
    return result;
  }, [nodes]);

  return (
    <Canvas
      camera={{ position: [0, 0, 3], fov: 45 }}
      shadows={false}
      dpr={[1, 2]}
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
    >
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[3, 2, 2]}
        intensity={1.2}
        color="#60a5fa"
      />
      <directionalLight
        position={[-2, -1, -1]}
        intensity={0.4}
        color="#22c55e"
      />

      <GlobeCore />

      <NodeInstances
        nodes={nodes}
        healthById={healthById}
        anomaliesById={anomaliesById}
        onHoverNode={onHoverNode}
        onSelectNode={onSelectNode}
      />

      {showArcs &&
        arcDefs.map((arc, idx) => (
          <Arc
            key={idx}
            start={arc.start}
            end={arc.end}
            weight={arc.weight}
            broken={arc.broken}
          />
        ))}

      <AutoRotateController />
    </Canvas>
  );
};


