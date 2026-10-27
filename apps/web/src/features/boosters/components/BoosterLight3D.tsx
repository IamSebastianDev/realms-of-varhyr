import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** A rare or legendary turning over: where (px from the canvas centre, y up) and which colour. */
export type LightBurst = { id: number; x: number; y: number; legendary: boolean };

const RAYS = 18,
  EMBERS = 90;

function texture(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w = 256,
  h = 256,
) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!, w, h);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Soft round falloff, bright in the middle. */
const glowMap = () =>
  texture((ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (let i = 0; i <= 10; i++)
      g.addColorStop(i / 10, `rgba(255,255,255,${Math.pow(1 - i / 10, 2.2)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

/** A beam of light: widest and brightest at its base (bottom), thinning and fading towards the tip. */
const rayMap = () =>
  texture(
    (ctx, w, h) => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);
      const image = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) {
        const along = 1 - y / (h - 1); // 0 at the base, 1 at the tip
        for (let x = 0; x < w; x++) {
          const across = Math.abs(x / (w - 1) - 0.5) * 2; // 0 centre, 1 edge
          const half = 1 - along * 0.4; // the beam barely narrows
          const edge = Math.exp(-Math.pow(across / half, 2) * 3.2); // gaussian: no hard edge
          const a = edge * Math.pow(1 - along, 1.8);
          const i = (y * w + x) * 4;
          image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
          image.data[i + 3] = Math.round(a * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    64,
    256,
  );

const smooth = (k: number) => k * k * (3 - 2 * k);
const clamp = (k: number) => Math.min(1, Math.max(0, k));

function Burst({ burst, onDone }: { burst: LightBurst; onDone: (id: number) => void }) {
  const { size } = useThree();
  const duration = burst.legendary ? 2.1 : 1.5;
  const tone = useMemo(
    () => ({
      main: new THREE.Color(burst.legendary ? "#ffae38" : "#9a5cff"),
      core: new THREE.Color(burst.legendary ? "#fff0c4" : "#eadcff"),
      ray: new THREE.Color(burst.legendary ? "#ffd27a" : "#b98cff"),
    }),
    [burst.legendary],
  );
  const maps = useMemo(() => ({ glow: glowMap(), ray: rayMap() }), []);
  const rays = useMemo(
    () =>
      Array.from({ length: RAYS }, (_, i) => ({
        angle: (i / RAYS) * Math.PI * 2 + (Math.random() - 0.5) * 0.35,
        width: 80 + Math.random() * 150,
        length: 320 + Math.random() * 420,
        lag: Math.random() * 0.08,
      })),
    [],
  );
  const embers = useMemo(() => {
    const position = new Float32Array(EMBERS * 3),
      velocity = Array.from({ length: EMBERS }, () => {
        const angle = Math.random() * Math.PI * 2,
          speed = 80 + Math.random() * 520;
        return [Math.cos(angle) * speed, Math.sin(angle) * speed * 0.8 + 90, Math.random() * 0.6];
      });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    return { geometry, position, velocity };
  }, []);
  const start = useRef<number | null>(null),
    done = useRef(false);
  const core = useRef<THREE.Sprite>(null),
    bloom = useRef<THREE.Sprite>(null),
    fan = useRef<THREE.Group>(null),
    beams = useRef<(THREE.Mesh | null)[]>([]),
    dust = useRef<THREE.Points>(null);

  useEffect(
    () => () => {
      maps.glow.dispose();
      maps.ray.dispose();
      embers.geometry.dispose();
    },
    [maps, embers],
  );

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current,
      k = clamp(t / duration);
    // Fast attack, long soft decay.
    const env = clamp(t / 0.09) * Math.pow(1 - k, 2.2);
    if (core.current) {
      const s = 380 + 520 * smooth(clamp(t / 0.6));
      core.current.scale.set(s, s, 1);
      core.current.material.opacity = 0.8 * env;
    }
    if (bloom.current) {
      const s = 1000 + 800 * smooth(clamp(t / 0.7));
      bloom.current.scale.set(s, s, 1);
      bloom.current.material.opacity = 0.95 * env;
    }
    if (fan.current) fan.current.rotation.z = -k * 0.4;
    rays.forEach((ray, i) => {
      const beam = beams.current[i];
      if (!beam) return;
      const grow = smooth(clamp((t - ray.lag) / 0.35));
      beam.scale.set(ray.width * (0.6 + 0.6 * grow), ray.length * grow, 1);
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.55 * env;
    });
    if (dust.current) {
      const dt = 1 / 60;
      for (let i = 0; i < EMBERS; i++) {
        const v = embers.velocity[i];
        v[0] *= 0.975;
        v[1] = v[1] * 0.975 + 6;
        embers.position[i * 3] += v[0] * dt;
        embers.position[i * 3 + 1] += v[1] * dt;
      }
      embers.geometry.attributes.position.needsUpdate = true;
      (dust.current.material as THREE.PointsMaterial).opacity =
        0.5 * clamp(1 - k * 1.1) * clamp(t / 0.05);
    }
    if (k >= 1 && !done.current) {
      done.current = true;
      onDone(burst.id);
    }
  });

  const additive = {
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  } as const;
  return (
    <>
      <group position={[burst.x, burst.y, 0]}>
        <sprite ref={bloom} position={[0, 0, -1]}>
          <spriteMaterial map={maps.glow} color={tone.main} opacity={0} {...additive} />
        </sprite>
        <group ref={fan} position={[0, 0, -0.5]}>
          {rays.map((ray, i) => (
            <group key={i} rotation={[0, 0, ray.angle]}>
              <mesh
                ref={(el) => {
                  beams.current[i] = el;
                }}
                position={[0, 0, 0]}
                scale={[1, 1, 1]}
                geometry={RAY_GEOMETRY}
              >
                <meshBasicMaterial map={maps.ray} color={tone.ray} opacity={0} {...additive} />
              </mesh>
            </group>
          ))}
        </group>
        <sprite ref={core} position={[0, 0, 0]}>
          <spriteMaterial map={maps.glow} color={tone.core} opacity={0} {...additive} />
        </sprite>
        <points ref={dust} geometry={embers.geometry} position={[0, 0, 0.5]}>
          <pointsMaterial
            map={maps.glow}
            color={tone.core}
            size={14}
            sizeAttenuation={false}
            opacity={0}
            {...additive}
          />
        </points>
      </group>
    </>
  );
}

/** A unit quad that grows upward from its own base, so a rotated group fans out from the centre. */
const RAY_GEOMETRY = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

/** Light that comes up behind the cards, over a transparent canvas. */
export default function BoosterLight3D({
  bursts,
  done,
}: {
  bursts: LightBurst[];
  done: (id: number) => void;
}) {
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 1, near: 0.1, far: 50 }}
      gl={{ alpha: true, antialias: true }}
      resize={{ offsetSize: true }}
      frameloop={bursts.length ? "always" : "never"}
      style={{ background: "transparent", pointerEvents: "none" }}
    >
      {bursts.map((burst) => (
        <Burst key={burst.id} burst={burst} onDone={done} />
      ))}
    </Canvas>
  );
}
