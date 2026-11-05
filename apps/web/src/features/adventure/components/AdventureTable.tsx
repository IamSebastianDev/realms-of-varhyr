import { memo, Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AdventureDef, NodeType } from "@realms/adventure";
import { mapLength, mapWidth, nodePosition } from "../lib/mapLayout";
import { adventureNodeTypes, mapTextureUrls } from "../lib/adventureMedia";
import { fireTextureUrl, TableProps, tablePropUrls } from "./TableProps";

type State = "current" | "visited" | "open" | "ahead";
type Palette = {
  bronze: string;
  gold: string;
  wood: string;
  ivory: string;
  ink: string;
  torch: string;
  halo: string;
  haloLight: string;
};
type Props = {
  def: AdventureDef;
  states: Map<string, State>;
  highlighted: string | null;
  target: RefObject<number>;
  wake: RefObject<() => void>;
  labels: RefObject<Map<string, HTMLButtonElement>>;
  reduced: boolean;
  active: boolean;
  ready: () => void;
  failed: () => void;
  palette: Palette;
};
/** Warm the same loader cache used by the table while the game is loading. */
export function preloadAdventureTable(definitions: AdventureDef[]) {
  for (const def of definitions) useLoader.preload(THREE.TextureLoader, mapTextureUrls(def));
  useLoader.preload(GLTFLoader, tablePropUrls);
  useLoader.preload(THREE.TextureLoader, fireTextureUrl);
}

/** One renderer for the entire table. HTML controls are projected from these exact world coordinates. */
export default function AdventureTable(props: Props) {
  return (
    <Canvas
      className="adv-canvas"
      style={{ position: "absolute", inset: 0 }}
      resize={{ offsetSize: true }}
      frameloop="demand"
      camera={{ position: [0, 24, 18], near: 0.1, far: 100, fov: 30 }}
      dpr={[1, 1.5]}
      shadows
      fallback={null}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(props.palette.wood);
        // All shadow casters and the directional light are fixed in world space.
        // Flickering point lights do not cast shadows, so keep this map between frames.
        gl.shadowMap.autoUpdate = false;
        gl.shadowMap.needsUpdate = true;
        gl.domElement.addEventListener("webglcontextlost", props.failed, { once: true });
      }}
    >
      <TableLight torch={props.palette.torch} />
      <ambientLight intensity={0.3} />
      <hemisphereLight args={[props.palette.ivory, props.palette.wood, 0.7]} />
      <directionalLight
        position={[-5, 12, 6]}
        intensity={1.15}
        color={props.palette.ivory}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-normalBias={0.035}
      />
      <Suspense fallback={null}>
        <Tabletop {...props} />
      </Suspense>
    </Canvas>
  );
}

function Tabletop({
  def,
  target,
  wake,
  labels,
  states,
  highlighted,
  reduced,
  active,
  ready,
  palette,
}: Props) {
  const { camera, size, invalidate, gl } = useThree();
  const textures = useLoader(THREE.TextureLoader, mapTextureUrls(def));
  const maps = useMemo(
    () =>
      textures.map((source, index) => {
        const texture = source.clone();
        if (index < 2) {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(4, 6);
        }
        if (index !== 1) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        return texture;
      }),
    [textures],
  );
  useEffect(() => () => maps.forEach((texture) => texture.dispose()), [maps]);
  const [wood, normal, parchment, ...engravings] = maps;
  // The tabletop repeats full planks; the small tokens use one close section of the grain.
  const [chipWood, chipNormal] = useMemo(
    () =>
      textures.slice(0, 2).map((source, index) => {
        const texture = source.clone();
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(0.18, 0.18);
        texture.offset.set(0.38, 0.46);
        if (index === 0) texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
      }),
    [textures],
  );
  useEffect(
    () => () => {
      chipWood.dispose();
      chipNormal.dispose();
    },
    [chipWood, chipNormal],
  );
  const paper = useMemo(() => parchmentMaterial(parchment), [parchment]);
  useEffect(() => () => paper.dispose(), [paper]);
  const bronzeTime = useMemo(() => ({ value: 0 }), []);
  const engravingByType = Object.fromEntries(
    adventureNodeTypes.map((type, i) => [type, engravings[i]]),
  ) as Record<NodeType, THREE.Texture>;
  const displayed = useRef(false);
  const revealFrame = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (revealFrame.current !== undefined) cancelAnimationFrame(revealFrame.current);
    },
    [],
  );
  const projected = useMemo(() => new THREE.Vector3(), []);
  const lastProjection = useRef({ z: Number.NaN, width: 0, height: 0 });
  useEffect(() => {
    // Suspended assets have now mounted; include them in the cached shadow map.
    gl.shadowMap.needsUpdate = true;
    lastProjection.current.z = Number.NaN;
    invalidate();
  }, [def, gl, invalidate]);
  useEffect(() => {
    camera.position.z = target.current + 18;
    wake.current = invalidate;
    invalidate();
    return () => {
      wake.current = () => {};
    };
  }, [camera, invalidate, ready, target, wake]);
  useFrame((_, delta) => {
    const z = reduced
      ? target.current
      : THREE.MathUtils.damp(camera.position.z - 18, target.current, 7, Math.min(delta, 0.1));
    // Static camera = static DOM hit targets. Moving every label at animation
    // speed forces WebKit to repeatedly update compositing and hit testing.
    const previous = lastProjection.current;
    if (z !== previous.z || size.width !== previous.width || size.height !== previous.height) {
      camera.position.set(0, 24, z + 18);
      camera.lookAt(0, 0, z);
      const cam = camera as THREE.PerspectiveCamera;
      // Fit the same table area at every stage aspect ratio, with a fixed viewing angle.
      const visibleHeight = Math.max(10.5, (24.8 * size.height) / size.width) * 1.1;
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visibleHeight / 60));
      cam.aspect = size.width / size.height;
      cam.updateProjectionMatrix();
      camera.updateMatrixWorld();
      for (const node of def.nodes) {
        const label = labels.current.get(node.id);
        if (!label) continue;
        const [xPos, , zPos] = nodePosition(node);
        projected.set(xPos, 0.35, zPos).project(camera);
        const x = (projected.x * 0.5 + 0.5) * size.width;
        const y = (-projected.y * 0.5 + 0.5) * size.height;
        label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        label.style.visibility = y < -60 || y > size.height + 60 ? "hidden" : "visible";
      }
      lastProjection.current = { z, width: size.width, height: size.height };
    }
    if (!displayed.current) {
      displayed.current = true;
      // useFrame runs before rendering. Wait until the following browser frame before fading in.
      revealFrame.current = requestAnimationFrame(ready);
    }
    if (Math.abs(z - target.current) > 0.001) invalidate();
  });
  return (
    <>
      <TorchLights palette={palette} active={active} reduced={reduced} bronzeTime={bronzeTime} />
      <TableProps time={bronzeTime} torch={palette.torch} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[32, 52]} />
        <meshStandardMaterial
          map={wood}
          normalMap={normal}
          normalScale={[0.85, 0.85]}
          bumpMap={wood}
          bumpScale={0.055}
          color={palette.wood}
          roughness={0.96}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[mapWidth, mapLength]} />
        <primitive object={paper} attach="material" />
      </mesh>
      <Routes def={def} states={states} palette={palette} />
      {def.nodes.map((node) => (
        <group key={node.id} position={nodePosition(node)}>
          <Location
            type={node.type}
            state={states.get(node.id)!}
            highlighted={states.get(node.id) === "open" && highlighted === node.id}
            mapActive={active}
            reduced={reduced}
            engraving={engravingByType[node.type]}
            wood={chipWood}
            normal={chipNormal}
            palette={palette}
            bronzeTime={bronzeTime}
          />
        </group>
      ))}
    </>
  );
}

/** Subtle paper fibres and a worn edge, applied to the existing illustration without animating the map. */
function parchmentMaterial(map: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap: map,
    bumpScale: 0.018,
    roughness: 0.94,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      float paperHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float paperNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(paperHash(i), paperHash(i + vec2(1., 0.)), f.x),
                   mix(paperHash(i + vec2(0., 1.)), paperHash(i + vec2(1., 1.)), f.x), f.y);
      }
    `,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
      float paperEdge = min(min(vMapUv.x, 1.0 - vMapUv.x), min(vMapUv.y, 1.0 - vMapUv.y));
      float paperFibre = paperNoise(vMapUv * vec2(440.0, 660.0));
      float paperMottle = paperNoise(vMapUv * vec2(36.0, 54.0));
      diffuseColor.rgb *= (0.97 + 0.04 * paperFibre + 0.025 * paperMottle)
                        * mix(0.91, 1.0, smoothstep(0.0, 0.065, paperEdge));
    `,
      );
  };
  material.customProgramCacheKey = () => "adventure-parchment-v1";
  return material;
}

function TableLight({ torch }: { torch: string }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl),
      room = new RoomEnvironment();
    room.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshLambertMaterial)
        object.material.emissive.set(torch);
    });
    const light = generator.fromScene(room, 0.04);
    scene.environment = light.texture;
    scene.environmentIntensity = 0.4;
    return () => {
      scene.environment = null;
      light.dispose();
      generator.dispose();
      room.dispose();
    };
  }, [gl, scene, torch]);
  return null;
}

/** The light moves with the view, as though torches illuminate the part of the table being studied. */
function TorchLights({
  palette,
  active,
  reduced,
  bronzeTime,
}: Pick<Props, "palette" | "active" | "reduced"> & { bronzeTime: { value: number } }) {
  const left = useRef<THREE.PointLight>(null);
  const right = useRef<THREE.PointLight>(null);
  const { invalidate, scene } = useThree();
  useEffect(() => {
    if (!active || reduced) {
      scene.environmentRotation.y = 0;
      invalidate();
      return;
    }
    // Demand rendering keeps the rest of the game idle; only the visible map flickers.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, 50);
    return () => window.clearInterval(timer);
  }, [active, reduced, invalidate, scene]);
  useFrame(({ camera, clock }) => {
    const z = camera.position.z - 18;
    const time = active && !reduced ? clock.elapsedTime : 0;
    bronzeTime.value = time;
    if (left.current) {
      left.current.position.set(
        -6 + 0.6 * Math.sin(time * 0.8),
        7,
        z - 4 + 0.5 * Math.sin(time * 1.1),
      );
      left.current.intensity = 190 * (1 + 0.24 * Math.sin(time * 1.7) + 0.1 * Math.sin(time * 4.1));
    }
    if (right.current) {
      right.current.position.set(7 + 0.4 * Math.sin(time * 0.65), 8, z + 5);
      right.current.intensity = 90 * (1 + 0.2 * Math.sin(time * 1.3));
    }
    // Shifting the room reflections lets the inlaid metal catch the moving light.
    scene.environmentRotation.y = 0.07 * Math.sin(time * 0.7);
  });
  return (
    <>
      <pointLight ref={left} color={palette.torch} intensity={190} distance={30} decay={2} />
      <pointLight ref={right} color={palette.gold} intensity={90} distance={30} decay={2} />
    </>
  );
}

/** Preserve the stamp silhouette and give its tiny surface a readable moving reflection. */
function bronzeStamp(shader: THREE.WebGLProgramParametersWithUniforms, time: { value: number }) {
  shader.uniforms.uBronzeTime = time;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nuniform float uBronzeTime;")
    .replace("#include <map_fragment>", "diffuseColor.a *= texture2D(map, vMapUv).a;")
    .replace(
      "#include <opaque_fragment>",
      `float reflectionCenter = 0.62 + 0.38 * sin(uBronzeTime * 0.8);
       float reflection = 1.0 - smoothstep(0.02, 0.28, abs(vMapUv.x * 0.8 + vMapUv.y * 0.35 - reflectionCenter));
       float flame = 0.85 + 0.1 * sin(uBronzeTime * 1.7) + 0.05 * sin(uBronzeTime * 4.1);
       outgoingLight = outgoingLight * (0.7 + 0.35 * reflection) + vec3(1.0, 0.53, 0.19) * reflection * flame * 0.8;
       #include <opaque_fragment>`,
    );
}

function Routes({ def, states, palette }: Pick<Props, "def" | "states" | "palette">) {
  const routes = useMemo(() => {
    const byId = new Map(def.nodes.map((node) => [node.id, node]));
    return def.nodes.flatMap((node) =>
      node.next.flatMap((id) => {
        const next = byId.get(id);
        if (!next) return [];
        const a = new THREE.Vector3(...nodePosition(node)),
          b = new THREE.Vector3(...nodePosition(next));
        // Let the route run beneath the columns. Their bodies hide the ends,
        // including on bends where the curve is not tangent to the straight chord.
        a.y = b.y = 0.04;
        const curve = new THREE.CubicBezierCurve3(
          a,
          new THREE.Vector3(a.x, 0.04, (a.z + b.z) / 2),
          new THREE.Vector3(b.x, 0.04, (a.z + b.z) / 2),
          b,
        );
        const taken =
          ["current", "visited"].includes(states.get(node.id)!) &&
          ["current", "visited"].includes(states.get(id)!);
        const open = states.get(node.id) === "current" && states.get(id) === "open";
        return [
          {
            id: `${node.id}-${id}`,
            open,
            taken,
            geometry: new THREE.TubeGeometry(curve, 24, open ? 0.025 : 0.014, 5, false),
          },
        ];
      }),
    );
  }, [def, states]);
  useEffect(() => () => routes.forEach((route) => route.geometry.dispose()), [routes]);
  return (
    <>
      {routes.map((route) => (
        <mesh key={route.id} geometry={route.geometry}>
          <meshBasicMaterial
            color={palette.ink}
            transparent
            opacity={route.open || route.taken ? 0.92 : 0.55}
          />
        </mesh>
      ))}
    </>
  );
}

/** Small wooden counters with a bronze rim and inlaid symbol. */
const Location = memo(function Location({
  type,
  state,
  highlighted,
  mapActive,
  reduced,
  engraving,
  wood,
  normal,
  palette,
  bronzeTime,
}: {
  type: NodeType;
  state: State;
  highlighted: boolean;
  mapActive: boolean;
  reduced: boolean;
  engraving: THREE.Texture;
  wood: THREE.Texture;
  normal: THREE.Texture;
  palette: Palette;
  bronzeTime: { value: number };
}) {
  const active = state === "open" || state === "current";
  const metal = highlighted ? palette.haloLight : active ? palette.gold : palette.bronze;
  const baseScale = type === "final" ? 0.78 : 0.7;
  return (
    <>
      <group scale={baseScale}>
        {state === "open" && (
          <ReachableHalo
            palette={palette}
            highlighted={highlighted}
            reduced={reduced}
            active={mapActive}
          />
        )}
        <mesh position={[0, 0.2065, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.62, 0.62, 0.413, 64]} />
          <meshStandardMaterial
            map={wood}
            normalMap={normal}
            normalScale={[0.3, 0.3]}
            color={palette.bronze}
            emissive={palette.gold}
            emissiveIntensity={highlighted ? 0.12 : 0}
            metalness={0.03}
            roughness={0.76}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.414, 0]}>
          <circleGeometry args={[0.47, 64]} />
          <meshStandardMaterial
            map={wood}
            normalMap={normal}
            normalScale={[0.25, 0.25]}
            color={palette.bronze}
            emissive={palette.gold}
            emissiveIntensity={highlighted ? 0.12 : 0}
            metalness={0.03}
            roughness={0.76}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.416, 0]}>
          <ringGeometry args={[0.48, 0.51, 64]} />
          <meshStandardMaterial
            color={metal}
            metalness={0.95}
            roughness={0.2}
            envMapIntensity={2.4}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.42, 0]}>
          <ringGeometry args={[0.39, 0.397, 64]} />
          <meshStandardMaterial
            color={metal}
            metalness={0.95}
            roughness={0.24}
            envMapIntensity={2.4}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.425, 0]}>
          <planeGeometry args={[0.71, 0.71]} />
          <meshPhysicalMaterial
            map={engraving}
            color={palette.gold}
            bumpMap={engraving}
            bumpScale={0.14}
            metalness={1}
            roughness={0.16}
            envMapIntensity={4}
            clearcoat={0.35}
            clearcoatRoughness={0.22}
            onBeforeCompile={(shader) => bronzeStamp(shader, bronzeTime)}
            customProgramCacheKey={() => "adventure-bronze-stamp-v2"}
            emissive={palette.bronze}
            emissiveMap={engraving}
            emissiveIntensity={highlighted ? 0.35 : 0.045}
            transparent
            depthWrite={false}
          />
        </mesh>
        {active && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.416, 0]}>
            <ringGeometry args={[0.56, 0.6, 64]} />
            <meshStandardMaterial
              color={palette.gold}
              metalness={0.75}
              roughness={0.35}
              emissive={palette.gold}
              emissiveIntensity={highlighted ? 0.45 : 0.03}
            />
          </mesh>
        )}
      </group>
    </>
  );
});

/** A slow, mottled haze curls around the chip at the height of its face. */
function ReachableHalo({
  palette,
  highlighted,
  reduced,
  active,
}: {
  palette: Palette;
  highlighted: boolean;
  reduced: boolean;
  active: boolean;
}) {
  const { invalidate } = useThree();
  const haze = useRef<THREE.Group>(null);
  const lightMaterial = useRef<THREE.ShaderMaterial>(null);
  const shadowMaterial = useRef<THREE.ShaderMaterial>(null);
  const glow = useMemo(
    () => ({
      darkTint: { value: new THREE.Color(palette.halo) },
      lightTint: { value: new THREE.Color(palette.haloLight) },
      strength: { value: 0.75 },
    }),
    [palette.halo, palette.haloLight],
  );
  const shadow = useMemo(() => ({ ...glow, shadowPass: { value: 1 } }), [glow]);
  const light = useMemo(() => ({ ...glow, shadowPass: { value: 0 } }), [glow]);
  useFrame(({ clock }) => {
    if (haze.current) haze.current.rotation.y = reduced ? 0 : clock.elapsedTime * 0.3;
    if (lightMaterial.current)
      lightMaterial.current.uniforms.strength.value = highlighted ? 1 : 0.75;
    if (shadowMaterial.current)
      shadowMaterial.current.uniforms.strength.value = highlighted ? 1 : 0.75;
    if (active && !reduced && document.visibilityState === "visible") invalidate();
  });
  const fragmentShader = `uniform vec3 darkTint; uniform vec3 lightTint; uniform float strength; uniform float shadowPass; varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
          }
          void main() {
            vec2 p = (vUv - 0.5) * 2.4;
            float radius = length(p);
            float grain = noise(p * 3.2) * 0.85 + noise(p * 6.0) * 0.15;
            float edge = smoothstep(0.54, 0.72, radius) * (1.0 - smoothstep(0.68, 1.18, radius));
            float wisps = smoothstep(0.12, 0.82, grain);
            vec3 color = mix(darkTint, lightTint, smoothstep(0.2, 0.75, grain));
            gl_FragColor = shadowPass > 0.5
              ? vec4(0.06, 0.035, 0.02, edge * wisps * strength * 0.65)
              : vec4(color, edge * wisps * strength);
          }`;
  const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  return (
    <group ref={haze}>
      {/* A soft projected shadow keeps the translucent haze legible over pale parchment. */}
      <mesh position={[0.12, 0.015, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
        <shaderMaterial
          ref={shadowMaterial}
          uniforms={shadow}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0.43, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
        <shaderMaterial
          ref={lightMaterial}
          uniforms={light}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
