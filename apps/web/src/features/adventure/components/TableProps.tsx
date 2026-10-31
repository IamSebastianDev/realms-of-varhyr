import { useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Fire, type FireRef } from "@wolffo/three-fire/react";

export const fireTextureUrl = "/adventures/shared/textures/fire-density.png";

export const tablePropUrls = [
  "/adventures/shared/props/iron_brazier/iron_brazier.glb",
  "/adventures/shared/props/seadogs_compass/seadogs_compass.gltf",
  "/adventures/shared/props/ornate_medieval_dagger/ornate_medieval_dagger.gltf",
  "/adventures/shared/props/brass_candleholders/brass_candleholders.gltf",
  "/adventures/shared/props/brass_goblets/brass_goblets.gltf",
  "/adventures/shared/props/tavern/jug.glb",
  "/adventures/shared/props/tavern/cup.glb",
  "/adventures/shared/props/tavern/bottle.glb",
  "/adventures/shared/props/tavern/pouch.glb",
  "/adventures/shared/props/tavern/lamp.glb",
  "/adventures/shared/props/tavern/candle.glb",
];

type Prop = {
  model: THREE.Object3D;
  position: [number, number, number];
  scale: number;
  rotation?: [number, number, number];
};
function ObjectOnTable({ model, position, scale, rotation }: Prop) {
  return <primitive object={model} position={position} scale={scale} rotation={rotation} />;
}

/** A campaign table: physical props are anchored in the world while the map moves beneath the camera. */
export function TableProps({ time, torch }: { time: { value: number }; torch: string }) {
  const [brazier, compass, dagger, candles, goblets, jug, cup, bottle, pouch, lamp, candle] =
    useLoader(GLTFLoader, tablePropUrls);
  const objects = useMemo(() => {
    const copy = (object: THREE.Object3D) => {
      const model = object.clone(true);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return model;
    };
    const singleDagger = copy(dagger.scene);
    const scabbard = singleDagger.getObjectByName("ornate_medieval_dagger_scabbard");
    if (scabbard) scabbard.visible = false;
    return {
      braziers: [copy(brazier.scene), copy(brazier.scene)],
      compass: copy(compass.scene),
      dagger: singleDagger,
      candle: copy(candles.scene.getObjectByName("brass_candleholder_01")!),
      goblet: copy(goblets.scene.getObjectByName("brass_goblet_02")!),
      jug: copy(jug.scene),
      cups: [copy(cup.scene), copy(cup.scene)],
      bottle: copy(bottle.scene),
      pouch: copy(pouch.scene),
      lamp: copy(lamp.scene),
      smallCandle: copy(candle.scene),
    };
  }, [brazier, compass, dagger, candles, goblets, jug, cup, bottle, pouch, lamp, candle]);
  return (
    <>
      <Brazier model={objects.braziers[0]} position={[-11.4, 0, -4]} time={time} torch={torch} />
      <Brazier model={objects.braziers[1]} position={[11.4, 0, -6]} time={time} torch={torch} />
      <ObjectOnTable
        model={objects.compass}
        position={[7.8, 0.02, 10.2]}
        scale={22}
        rotation={[0, -0.5, 0]}
      />
      <ObjectOnTable
        model={objects.dagger}
        position={[-9.7, 0.4, 6.5]}
        scale={29}
        rotation={[Math.PI / 2, 0, 0.08]}
      />
      <ObjectOnTable
        model={objects.pouch}
        position={[-6.8, 0.08, 13.6]}
        scale={4}
        rotation={[0, 0.5, 0]}
      />
      <Coins position={[-4.8, 0.06, 14.1]} />
      <Coins position={[-8.3, 0.06, -12.7]} />
      <ObjectOnTable
        model={objects.jug}
        position={[10.5, 0, 12.8]}
        scale={7}
        rotation={[0, 0.8, 0]}
      />
      <ObjectOnTable
        model={objects.cups[0]}
        position={[7.7, 0, 14.8]}
        scale={10}
        rotation={[0, -0.6, 0]}
      />
      <ObjectOnTable
        model={objects.cups[1]}
        position={[-6.8, 0, -13]}
        scale={10}
        rotation={[0, 0.9, 0]}
      />
      <ObjectOnTable
        model={objects.bottle}
        position={[10.2, 0, 4]}
        scale={9}
        rotation={[0, -0.4, 0]}
      />
      <TavernCandle
        holder={objects.lamp}
        candle={objects.smallCandle}
        position={[10.7, 0, 7]}
        time={time}
        torch={torch}
      />
      <Candle model={objects.candle} position={[8.5, 0, -10]} time={time} torch={torch} />
      <ObjectOnTable
        model={objects.goblet}
        position={[-9.5, 0, -10.8]}
        scale={15}
        rotation={[0, -0.7, 0]}
      />
    </>
  );
}

function TavernCandle({
  holder,
  candle,
  position,
  time,
  torch,
}: {
  holder: THREE.Object3D;
  candle: THREE.Object3D;
  position: [number, number, number];
  time: { value: number };
  torch: string;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 5 * (1 + 0.15 * Math.sin(time.value * 3.7));
  });
  return (
    <group position={position} scale={1.35}>
      <primitive object={holder} scale={7} />
      <primitive object={candle} position={[0, 0.55, 0]} scale={7} />
      <pointLight
        ref={light}
        position={[0, 1.8, 0]}
        color={torch}
        intensity={5}
        distance={4}
        decay={2}
      />
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshBasicMaterial color={torch} />
      </mesh>
    </group>
  );
}

/** A few loose, worn coins, rather than oversized treasure piles. */
function Coins({ position }: { position: [number, number, number] }) {
  const pieces = [
    [0, 0, 0, 0.7],
    [0.55, 0, 0.12, -0.2],
    [-0.32, 0, 0.48, 1.1],
    [0.2, 0.055, 0.38, -0.7],
    [0.75, 0, -0.4, 0.3],
  ];
  return (
    <group position={position}>
      {pieces.map(([x, y, z, angle], i) => (
        <group key={i} position={[x, y, z]} rotation={[0, angle, 0]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.24, 0.24, 0.055, 32]} />
            <meshStandardMaterial
              color={i % 2 ? "#a5824d" : "#c1a16a"}
              metalness={0.9}
              roughness={0.34}
            />
          </mesh>
          <mesh position={[0, 0.029, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.16, 0.175, 32]} />
            <meshStandardMaterial color="#d8bd80" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[0.055, 0.075, 4]} />
            <meshStandardMaterial color="#d8bd80" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Candle({
  model,
  position,
  time,
  torch,
}: {
  model: THREE.Object3D;
  position: [number, number, number];
  time: { value: number };
  torch: string;
}) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 5 * (1 + 0.15 * Math.sin(time.value * 3.7));
  });
  return (
    <group position={position}>
      <primitive object={model} position={[0, 0, 0]} scale={8} />
      <pointLight
        ref={light}
        position={[0, 2.88, 0]}
        color={torch}
        intensity={5}
        distance={4}
        decay={2}
      />
    </group>
  );
}

function Brazier({
  model,
  position,
  time,
  torch,
}: {
  model: THREE.Object3D;
  position: [number, number, number];
  time: { value: number };
  torch: string;
}) {
  return (
    <group position={position} scale={2.35}>
      <primitive object={model} scale={1.15} />
      {[
        [0, 0],
        [-0.19, 0.08],
        [0.2, -0.04],
        [0.03, -0.2],
        [-0.12, -0.17],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.57, z]} scale={[0.18, 0.1, 0.15]}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#211814"
            emissive="#9d3107"
            emissiveIntensity={0.35}
            roughness={1}
          />
        </mesh>
      ))}
      <Flame time={time} torch={torch} />
    </group>
  );
}

function Flame({ time, torch }: { time: { value: number }; torch: string }) {
  const light = useRef<THREE.PointLight>(null);
  const fire = useRef<FireRef>(null);
  useFrame(() => {
    // Drive fire from the table clock so reduced-motion and covered maps stay still.
    fire.current?.update(time.value);
    if (light.current) light.current.intensity = 8 * (1 + 0.2 * Math.sin(time.value * 4.1));
  });
  return (
    <group position={[0, 0.63, 0]}>
      <pointLight ref={light} color={torch} intensity={8} distance={5} decay={2} />
      <Fire
        ref={fire}
        texture={fireTextureUrl}
        autoUpdate={false}
        position={[0, 0.4, 0]}
        scale={[0.75, 1.15, 0.75]}
        color="#ff791f"
        iterations={16}
        octaves={3}
        magnitude={1.25}
      />
    </group>
  );
}
