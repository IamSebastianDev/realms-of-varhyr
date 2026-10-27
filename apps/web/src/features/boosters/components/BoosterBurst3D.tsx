import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Environment,
  packMaterials,
  prepare,
  SIZE,
  THIN,
  usePackArt,
  type CarouselPack,
} from "./BoosterPack3D";

/** Seconds: the pack fades in and charges, bursts at BURST, and the scene is done at DONE. */
const BURST = 1.5,
  DONE = 3.1;
const COLUMNS = 5,
  ROWS = 9;

type Chunk = {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
};

/** Cuts the pack into a grid of shards. Each shard keeps the front/back/rim groups so it prints like the whole. */
function shatter(source: THREE.BufferGeometry): Chunk[] {
  source.computeBoundingBox();
  const box = source.boundingBox!,
    width = box.max.x - box.min.x,
    height = box.max.y - box.min.y;
  const position = source.attributes.position,
    normal = source.attributes.normal,
    uv = source.attributes.uv,
    index = source.index!;
  const cells = new Map<number, number[][]>();
  const c = new THREE.Vector3(),
    p = new THREE.Vector3();
  for (const group of source.groups) {
    for (let at = group.start; at < group.start + group.count; at += 3) {
      c.set(0, 0, 0);
      for (let k = 0; k < 3; k++) c.add(p.fromBufferAttribute(position, index.getX(at + k)));
      c.multiplyScalar(1 / 3);
      const col = Math.min(
        COLUMNS - 1,
        Math.max(0, Math.floor(((c.x - box.min.x) / width) * COLUMNS)),
      );
      const row = Math.min(ROWS - 1, Math.max(0, Math.floor(((c.y - box.min.y) / height) * ROWS)));
      const key = row * COLUMNS + col;
      if (!cells.has(key)) cells.set(key, [[], [], []]);
      for (let k = 0; k < 3; k++)
        cells.get(key)![group.materialIndex ?? 0].push(index.getX(at + k));
    }
  }
  return [...cells.entries()].map(([key, kinds]) => {
    const all = kinds.flat(),
      center = new THREE.Vector3();
    for (const v of all) center.add(p.fromBufferAttribute(position, v));
    center.multiplyScalar(1 / all.length);
    const pos = new Float32Array(all.length * 3),
      nor = new Float32Array(all.length * 3),
      tex = new Float32Array(all.length * 2);
    all.forEach((v, i) => {
      pos[i * 3] = position.getX(v) - center.x;
      pos[i * 3 + 1] = position.getY(v) - center.y;
      pos[i * 3 + 2] = position.getZ(v) - center.z;
      nor[i * 3] = normal.getX(v);
      nor[i * 3 + 1] = normal.getY(v);
      nor[i * 3 + 2] = normal.getZ(v);
      tex[i * 2] = uv.getX(v);
      tex[i * 2 + 1] = uv.getY(v);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(tex, 2));
    let start = 0;
    kinds.forEach((list, material) => {
      geometry.addGroup(start, list.length, material);
      start += list.length;
    });
    const seed = ((key * 9301 + 49297) % 233280) / 233280,
      seed2 = ((key * 7919 + 1237) % 10007) / 10007;
    // Outward from the pack's middle, with a push toward the camera so the pieces fly at the viewer.
    const outward = new THREE.Vector3(center.x, center.y * 0.75, 0)
      .normalize()
      .multiplyScalar(2.2 + seed * 2.4);
    const velocity = outward.add(
      new THREE.Vector3((seed2 - 0.5) * 1.2, (seed - 0.5) * 1.2, 1.2 + seed2 * 3.2),
    );
    const spin = new THREE.Vector3((seed - 0.5) * 11, (seed2 - 0.5) * 11, (seed + seed2 - 1) * 8);
    return { geometry, center, velocity, spin };
  });
}

/** A soft round sprite for the flash. */
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const SPARKS = 160;

function Burst({
  pack,
  tagline,
  go,
  done,
}: {
  pack: CarouselPack;
  tagline: string;
  go: boolean;
  done: () => void;
}) {
  const art = usePackArt([pack], tagline)[0];
  const loaded = useLoader(GLTFLoader, pack.model);
  const chunks = useMemo(() => {
    const model = prepare(
      (loaded.scene.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh).geometry,
    );
    const { width, height, thin } = pack.variant;
    model.geometry.applyMatrix4(
      new THREE.Matrix4().makeScale(SIZE * width, SIZE * height, SIZE * THIN * thin),
    );
    const out = shatter(model.geometry);
    model.geometry.dispose();
    return out;
  }, [loaded, pack.variant]);
  const materials = useMemo(
    () =>
      packMaterials(art.map, pack.color, pack.variant.finish).map((material) => {
        material.side = THREE.DoubleSide;
        return material;
      }),
    [art, pack.color, pack.variant.finish],
  );
  const glow = useMemo(glowTexture, []);
  const sparks = useMemo(() => {
    const geometry = new THREE.BufferGeometry(),
      dirs: THREE.Vector3[] = [];
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    for (let i = 0; i < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2,
        b = Math.random() * 2 - 1,
        r = Math.sqrt(1 - b * b),
        speed = 1.2 + Math.random() * 3.4;
      dirs.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, b * 0.8).multiplyScalar(speed));
    }
    return {
      geometry,
      dirs,
      material: new THREE.PointsMaterial({
        color: new THREE.Color(pack.color).lerp(new THREE.Color("#fff1c4"), 0.6),
        size: 0.05,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    };
  }, [pack.color]);
  useEffect(
    () => () => {
      chunks.forEach((chunk) => chunk.geometry.dispose());
      materials.forEach((material) => material.dispose());
      glow.dispose();
      sparks.geometry.dispose();
      sparks.material.dispose();
    },
    [chunks, materials, glow, sparks],
  );

  const root = useRef<THREE.Group>(null),
    pieces = useRef<(THREE.Mesh | null)[]>([]),
    flash = useRef<THREE.Sprite>(null),
    light = useRef<THREE.PointLight>(null),
    points = useRef<THREE.Points>(null);
  const mount = useRef<number | null>(null),
    start = useRef<number | null>(null),
    finished = useRef(false);
  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (mount.current === null) mount.current = now;
    if (go && start.current === null) start.current = now;
    // `tm` runs from the pack's arrival and keeps it gently turning; `t` runs from the click that starts the burst.
    const tm = now - mount.current,
      t = start.current === null ? -1 : now - start.current,
      g = root.current;
    if (!g) return;
    const s = Math.max(0, t - BURST);
    // Arrival, then idle until clicked; after the click the pack shakes harder until it bursts.
    const arrive = Math.min(1, tm / 0.55),
      charge = t < 0 ? 0 : THREE.MathUtils.clamp(t / BURST, 0, 1);
    const shake = charge * charge * 0.07 * (t < BURST ? 1 : 0),
      bob = t < 0 ? Math.sin(tm * 1.6) * 0.06 : 0;
    g.position.set(Math.sin(tm * 61) * shake, Math.cos(tm * 47) * shake + bob, 0);
    g.rotation.set(
      0,
      THREE.MathUtils.lerp(-0.9, Math.sin(tm * 0.8) * 0.18, 1 - Math.pow(1 - arrive, 3)),
      Math.sin(tm * 53) * shake * 0.6,
    );
    g.scale.setScalar((0.7 + 0.3 * (1 - Math.pow(1 - arrive, 3))) * (1 + charge * 0.12));
    // Shards.
    const k = 2.1,
      travel = (1 - Math.exp(-k * s)) / k;
    chunks.forEach((chunk, i) => {
      const mesh = pieces.current[i];
      if (!mesh) return;
      mesh.position.copy(chunk.center).addScaledVector(chunk.velocity, travel);
      mesh.rotation.set(chunk.spin.x * s * 0.5, chunk.spin.y * s * 0.5, chunk.spin.z * s * 0.5);
    });
    const fade = t < BURST ? Math.min(1, tm / 0.3) : Math.max(0, 1 - Math.max(0, s - 0.35) / 0.85);
    for (const material of materials) material.opacity = fade;
    // Flash, light and sparks.
    if (flash.current) {
      const m = flash.current.material as THREE.SpriteMaterial;
      flash.current.scale.setScalar(0.8 + s * 9);
      m.opacity = s > 0 ? Math.max(0, 1 - s / 0.7) * 0.95 : charge * charge * 0.35;
    }
    if (light.current)
      light.current.intensity = t < BURST ? charge * 10 : Math.max(0, 70 * (1 - s / 0.8));
    if (points.current) {
      const attr = sparks.geometry.attributes.position as THREE.BufferAttribute,
        travelSpark = (1 - Math.exp(-1.6 * s)) / 1.6;
      sparks.dirs.forEach((dir, i) =>
        attr.setXYZ(i, dir.x * travelSpark, dir.y * travelSpark, dir.z * travelSpark),
      );
      attr.needsUpdate = true;
      sparks.material.opacity = s > 0 ? Math.max(0, 1 - s / 1.6) : 0;
      sparks.material.size = 0.05 + 0.02 * Math.sin(t * 40);
    }
    if (t > DONE && !finished.current) {
      finished.current = true;
      done();
    }
  });
  const color = new THREE.Color(pack.color).lerp(new THREE.Color("#fff2cf"), 0.55);
  return (
    <>
      <pointLight
        ref={light}
        position={[0, 0, 1.4]}
        intensity={0}
        color={pack.color}
        distance={9}
      />
      <group ref={root}>
        {chunks.map((chunk, i) => (
          <mesh
            key={i}
            ref={(el) => {
              pieces.current[i] = el;
            }}
            geometry={chunk.geometry}
            material={materials}
            position={chunk.center}
          />
        ))}
      </group>
      <points ref={points} geometry={sparks.geometry} material={sparks.material} />
      <sprite ref={flash} position={[0, 0, 0.6]}>
        <spriteMaterial
          map={glow}
          color={color}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </>
  );
}

/** The booster on its dark stage: it charges, bursts into shards and sparks, then reports that it is done. */
export default function BoosterBurst3D({
  pack,
  tagline,
  go,
  done,
}: {
  pack: CarouselPack;
  tagline: string;
  go: boolean;
  done: () => void;
}) {
  return (
    <Canvas
      resize={{ offsetSize: true }}
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 0, 10], fov: 30 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Environment />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-3, -2, 3]} intensity={8} color={pack.color} />
      <Burst pack={pack} tagline={tagline} go={go} done={done} />
    </Canvas>
  );
}
