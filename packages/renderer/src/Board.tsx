import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Component,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { CardArtwork } from "./CardArtwork";
import { useCardAppearance } from "./CardStyles";
import { HolographicFoil } from "./HolographicFoil";
import { finishIndex, type CardFinish } from "./cardFinishes";
import { holographicFragmentShader, holographicVertexShader } from "./holographicShader";
import { usePresentation } from "./presentation";
import * as THREE from "three";
import { positionName } from "@realms/contracts";
import type { CardInstance, PlayerId, PlayerView, Registry } from "@realms/contracts";
let blobCache: THREE.Texture | null = null;
/** A soft round falloff, used for contact shadows, sheens and motes. */
function blobTexture() {
  if (blobCache) return blobCache;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  blobCache = new THREE.CanvasTexture(c);
  return blobCache;
}
const positions = (slot: number, own: boolean, attacking = false): [number, number, number] => [
  (slot - 2) * 2.03,
  0.055,
  (own ? 1.4 : -1.4) + (attacking ? (own ? -0.38 : 0.38) : 0),
];
export type SlotLayout = {
  player: PlayerId;
  slot: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
function SlotAnchors({
  viewer,
  view,
  attacks,
  onLayout,
}: {
  viewer: PlayerId;
  view: PlayerView;
  attacks: string[];
  onLayout: (slots: SlotLayout[]) => void;
}) {
  const { camera, size } = useThree();
  const previous = useRef("");
  useFrame(() => {
    const signature = `${viewer}:${attacks.join(",")}:${size.width}:${size.height}:${camera.projectionMatrix.elements.join(",")}`;
    if (previous.current === signature) return;
    previous.current = signature;
    camera.updateMatrixWorld();
    const slots: SlotLayout[] = [];
    for (const player of ["p1", "p2"] as PlayerId[])
      for (let slot = 0; slot < 5; slot++) {
        const [x, y, z] = positions(
          slot,
          player === viewer,
          attacks.includes(view.players[player].board[slot] ?? ""),
        );
        const points = [
          [-0.8, -1.105],
          [0.8, -1.105],
          [-0.8, 1.105],
          [0.8, 1.105],
        ].map(([dx, dz]) => new THREE.Vector3(x + dx, y + 0.062, z + dz).project(camera));
        const xs = points.map((p) => ((p.x + 1) * size.width) / 2),
          ys = points.map((p) => ((1 - p.y) * size.height) / 2);
        slots.push({
          player,
          slot,
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
        });
      }
    onLayout(slots);
  });
  return null;
}
function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    (camera as THREE.OrthographicCamera).zoom = Math.min(size.width / 10.6, size.height / 5.1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}
function useCardTexture(card: CardInstance, registry: Registry, reduced: boolean) {
  const def = registry.cards[card.definitionId];
  const exhausted = useRef(card.exhausted);
  exhausted.current = card.exhausted;
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const painter = useRef<((time: number) => void) | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useFrame(({ clock }) => painter.current?.(clock.elapsedTime));
  useEffect(() => {
    // Painted at twice the layout size (512x720 units) so artwork stays sharp on dense screens and large boards.
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1440;
    const ctx = canvas.getContext("2d")!,
      map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = maxAnisotropy;
    ctx.scale(2, 2);
    ctx.imageSmoothingQuality = "high";
    const img = new Image();
    let video: HTMLVideoElement | undefined,
      alive = true,
      lastTime = -1,
      lastFrame = -1,
      lastExhausted: boolean | undefined;
    const render = (art?: HTMLImageElement | HTMLVideoElement) => {
      if (!alive) return;
      const dim = exhausted.current;
      ctx.fillStyle = dim ? "#0d0c0a" : "#12100d";
      ctx.fillRect(0, 0, 512, 720);
      if (art) {
        const width = art instanceof HTMLVideoElement ? art.videoWidth : art.naturalWidth,
          height = art instanceof HTMLVideoElement ? art.videoHeight : art.naturalHeight;
        const scale = Math.max(512 / width, 720 / height),
          cropWidth = 512 / scale,
          cropHeight = 720 / scale;
        ctx.filter = dim ? "brightness(0.62) saturate(0.25) contrast(1.05)" : "none";
        ctx.drawImage(
          art,
          (width - cropWidth) / 2,
          (height - cropHeight) / 2,
          cropWidth,
          cropHeight,
          0,
          0,
          512,
          720,
        );
        ctx.filter = "none";
        // A cold wash makes a spent card read as asleep rather than merely darker.
        if (dim) {
          ctx.fillStyle = "#0d1c2c4d";
          ctx.fillRect(0, 0, 512, 720);
        }
      }
      // Frame, shade, type line and stats are the DOM card face laid over this plane (one design for hand, board and menus); the texture is only art on a dark ground.
      lastExhausted = dim;
      map.needsUpdate = true;
    };
    render();
    setTexture(map);
    img.onload = () => render(img);
    img.src = def.art;
    if (def.animation && !reduced) {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.src = def.animation;
      // Failed/unsupported autoplay retains the still artwork.
      void video.play().catch(() => {});
    }
    painter.current = (time) => {
      const dimChanged = lastExhausted !== exhausted.current;
      if (!dimChanged && time - lastFrame < 1 / 30) return;
      if (video && video.readyState >= 2 && (dimChanged || video.currentTime !== lastTime)) {
        render(video);
        lastTime = video.currentTime;
        lastFrame = time;
      } else if (dimChanged && img.complete && img.naturalWidth) render(img);
    };
    return () => {
      alive = false;
      painter.current = null;
      img.onload = null;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      map.dispose();
    };
  }, [def.art, def.animation, def.legendary, def.type, reduced, maxAnisotropy]);
  return texture;
}
function Frame({
  color,
  opacity = 1,
  width = 1.66,
  height = 2.28,
}: {
  color: string;
  opacity?: number;
  width?: number;
  height?: number;
}) {
  return (
    <group>
      {[
        [0, -height / 2, width, 0.013],
        [0, height / 2, width, 0.013],
        [-width / 2, 0, 0.013, height],
        [width / 2, 0, 0.013, height],
      ].map(([x, z, w, h], i) => (
        <mesh key={i} position={[x, 0.019, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      ))}
    </group>
  );
}
function useHoldToInspect(inspect: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    start = useRef<[number, number]>([0, 0]),
    held = useRef(false),
    callback = useRef(inspect);
  callback.current = inspect;
  const cancel = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (event: { pointerType: string; clientX: number; clientY: number }) => {
      cancel();
      held.current = false;
      start.current = [event.clientX, event.clientY];
      if (event.pointerType === "touch")
        timer.current = setTimeout(() => {
          held.current = true;
          callback.current();
        }, 450);
    },
    onPointerMove: (event: { clientX: number; clientY: number }) => {
      if (Math.hypot(event.clientX - start.current[0], event.clientY - start.current[1]) > 8)
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    suppressClick: () => held.current,
  };
}
function BattlefieldFoil({
  finish,
  pointer,
  exhausted,
  reduced,
}: {
  finish: CardFinish;
  pointer: THREE.Vector2;
  exhausted: boolean;
  reduced: boolean;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: holographicVertexShader,
        fragmentShader: holographicFragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uPointer: { value: new THREE.Vector2(0.5, 0.5) },
          uStrength: { value: 0.85 },
          uFinish: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }, delta) => {
    material.uniforms.uFinish.value = finishIndex(finish);
    material.uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
    const light = material.uniforms.uPointer.value as THREE.Vector2;
    if (reduced) light.set(0.5, 0.5);
    else light.lerp(pointer, 1 - Math.exp(-10 * delta));
    material.uniforms.uStrength.value = exhausted ? 0.3 : 0.85;
  });
  return (
    <mesh
      position={[0, 0.029, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => {}}
      material={material}
    >
      <planeGeometry args={[1.54, 2.15]} />
    </mesh>
  );
}
export type BoardDragStart = (
  id: string,
  event: {
    button: number;
    isPrimary: boolean;
    clientX: number;
    clientY: number;
    pointerId: number;
    pointerType: string;
    currentTarget?: EventTarget | null;
  },
) => void;
/** Fade a card body without disturbing the opacities its parts were built with. */
function fade(group: THREE.Object3D, alpha: number, bright = 1) {
  group.traverse((o) => {
    const m = (o as THREE.Mesh).material as
      | (THREE.Material & { map?: THREE.Texture | null; color?: THREE.Color })
      | undefined;
    if (!m || (m as unknown as THREE.ShaderMaterial).isShaderMaterial) return;
    m.userData.base ??= m.opacity;
    m.transparent = alpha < 1 || m.userData.base < 1;
    m.opacity = m.userData.base * alpha;
    // A card in the thick of a fight reads at full brightness even when it is exhausted.
    if (m.map && m.color) {
      m.userData.color ??= m.color.clone();
      m.color.copy(m.userData.color).multiplyScalar(bright);
    }
  });
}
export type CardPose = {
  x: number;
  y: number;
  s: number;
  rot: number;
  alpha: number;
  lift: boolean;
};

function Card({
  card,
  view,
  registry,
  own,
  highlight,
  selected,
  targeted,
  attacking,
  blocking,
  onSelect,
  onInspect,
  onHover,
  onDragStart,
  reduced,
  pulse,
  poses,
}: {
  poses?: MutableRefObject<Record<string, CardPose>>;
  card: CardInstance;
  view: PlayerView;
  registry: Registry;
  own: boolean;
  highlight: boolean;
  selected: boolean;
  targeted: boolean;
  attacking: boolean;
  blocking: boolean;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDragStart?: BoardDragStart;
  reduced: boolean;
  pulse?: string;
}) {
  const hold = useHoldToInspect(() => onInspect(card.id));
  const legendary = registry.cards[card.definitionId].legendary;
  const appearance = useCardAppearance(registry.cards[card.definitionId]);
  const foilPointer = useMemo(() => new THREE.Vector2(0.5, 0.5), []);
  const texture = useCardTexture(card, registry, reduced),
    root = useRef<THREE.Group>(null),
    group = useRef<THREE.Group>(null),
    [hovered, setHovered] = useState(false),
    pos = positions(card.slot!, own);
  const fx = useRef<THREE.Group>(null),
    shadow = useRef<THREE.Mesh>(null),
    sheen = useRef<THREE.Mesh>(null),
    { camera, size } = useThree();
  // A pose is a pixel offset from the card's resting place; the same pose moves this body and its text face on the page.
  useFrame(() => {
    const g = fx.current,
      r = root.current;
    if (!g || !r) return;
    const pose = poses?.current[card.id];
    if (!pose) {
      if (g.userData.moved) {
        g.position.set(0, 0, 0);
        g.scale.setScalar(1);
        g.rotation.set(0, 0, 0);
        fade(g, 1);
        g.userData.moved = false;
      }
      return;
    }
    r.updateWorldMatrix(true, false);
    const o = r.getWorldPosition(new THREE.Vector3());
    const px = (v: THREE.Vector3) => {
      const p = v.clone().project(camera);
      return [((p.x + 1) * size.width) / 2, ((1 - p.y) * size.height) / 2];
    };
    const [ox, oy] = px(o),
      [ax, ay] = px(o.clone().add(new THREE.Vector3(1, 0, 0))),
      [bx, by] = px(o.clone().add(new THREE.Vector3(0, 0, 1)));
    const a = ax - ox,
      b = bx - ox,
      c = ay - oy,
      d = by - oy,
      det = a * d - b * c || 1;
    g.position.set(
      (d * pose.x - b * pose.y) / det,
      pose.lift ? 0.4 : 0,
      (-c * pose.x + a * pose.y) / det,
    );
    g.scale.setScalar(pose.s);
    g.rotation.y = (-pose.rot * Math.PI) / 180;
    fade(g, pose.alpha, pose.lift ? 1.7 : 1);
    g.userData.moved = true;
  });
  useFrame((_state, delta) => {
    if (root.current) {
      const z = positions(card.slot!, own, attacking)[2];
      root.current.position.z = reduced
        ? z
        : THREE.MathUtils.damp(root.current.position.z, z, 12, delta);
    }
    const g = group.current;
    if (g) {
      const height = hovered ? 0.26 : 0.035;
      g.position.y = reduced ? height : THREE.MathUtils.damp(g.position.y, height, 10, delta);
      // Lean toward the pointer, and let a soft light slide under it.
      const k = hovered && !reduced ? 0.09 : 0,
        tx = (0.5 - foilPointer.y) * k,
        tz = -(foilPointer.x - 0.5) * k;
      g.rotation.x = THREE.MathUtils.damp(g.rotation.x, tx, 12, delta);
      g.rotation.z = THREE.MathUtils.damp(g.rotation.z, tz, 12, delta);
      const sh = sheen.current;
      if (sh) {
        const m = sh.material as THREE.MeshBasicMaterial,
          want = hovered && !reduced ? 0.3 : 0;
        m.opacity = THREE.MathUtils.damp(m.opacity, want, 10, delta);
        sh.visible = m.opacity > 0.01;
        sh.position.set((foilPointer.x - 0.5) * 1.5, 0.031, -(foilPointer.y - 0.5) * 2.1);
      }
    }
    // The contact shadow widens and fades as the card rises or is thrown forward in a fight.
    const s = shadow.current,
      f = fx.current;
    if (s && f && g) {
      const h = Math.max(0, g.position.y + f.position.y - 0.035);
      const sc = (1 + h * 0.9) * f.scale.x;
      s.scale.set(sc, sc, 1);
      s.position.set(f.position.x + h * 0.35, -0.012, f.position.z + h * 0.45);
      (s.material as THREE.MeshBasicMaterial).opacity =
        (0.5 / (1 + h * 1.6)) * (card.exhausted ? 0.7 : 1);
    }
  });
  return (
    <group ref={root} position={pos}>
      <mesh
        ref={shadow}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.012, 0]}
        renderOrder={-1}
        raycast={() => {}}
      >
        <planeGeometry args={[2.15, 2.8]} />
        <meshBasicMaterial
          map={blobTexture()}
          color="#000000"
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <group ref={fx}>
        <group
          ref={group}
          onPointerDown={(e) => {
            hold.onPointerDown(e);
            if (own) onDragStart?.(card.id, e.nativeEvent);
          }}
          onPointerMove={(e) => {
            hold.onPointerMove(e);
            if (e.uv) foilPointer.copy(e.uv);
          }}
          onPointerUp={hold.onPointerUp}
          onPointerCancel={hold.onPointerCancel}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            onHover(card.id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            hold.onPointerCancel();
            foilPointer.set(0.5, 0.5);
            setHovered(false);
            onHover(null);
            document.body.style.cursor = "";
          }}
          onContextMenu={(e) => {
            e.nativeEvent.preventDefault();
            e.stopPropagation();
            onInspect(card.id);
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (hold.suppressClick()) return;
            if (e.shiftKey) onInspect(card.id);
            else onSelect(card.id);
          }}
        >
          <mesh position={[0, 0.002, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.6, 0.042, 2.21]} />
            <meshStandardMaterial
              color={
                blocking
                  ? "#4aaeb5"
                  : attacking
                    ? "#b78a42"
                    : selected
                      ? "#8c713f"
                      : legendary
                        ? "#ae8a48"
                        : "#2e3330"
              }
              roughness={0.7}
            />
          </mesh>
          <mesh position={[0, 0.027, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 2.21]} />
            <meshBasicMaterial
              key={texture?.uuid ?? "loading"}
              map={texture}
              color={texture ? "#ffffff" : "#14110c"}
              toneMapped={false}
            />
          </mesh>
          <mesh ref={sheen} visible={false} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <planeGeometry args={[1.5, 1.5]} />
            <meshBasicMaterial
              map={blobTexture()}
              color="#fff3d0"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {appearance !== "original" && (
            <BattlefieldFoil
              finish={appearance}
              pointer={foilPointer}
              exhausted={card.exhausted}
              reduced={reduced}
            />
          )}
          <Frame
            width={1.65}
            height={2.26}
            color={
              pulse === "damage"
                ? "#e9a17e"
                : pulse === "energy"
                  ? "#f3e2b4"
                  : targeted
                    ? "#d58873"
                    : blocking
                      ? "#9df5fa"
                      : attacking
                        ? "#ffe0a0"
                        : selected
                          ? "#efd18b"
                          : highlight
                            ? "#e2c98c"
                            : "#a18a5f"
            }
            opacity={
              highlight || selected || targeted || blocking || attacking || pulse
                ? 1
                : card.exhausted
                  ? 0.28
                  : 0.5
            }
          />
          {(selected || targeted || attacking || blocking) && (
            <mesh position={[0, -0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[1.79, 2.4]} />
              <meshBasicMaterial
                color={targeted ? "#c87150" : blocking ? "#6ce5f3" : "#f1c15a"}
                transparent
                opacity={blocking ? 0.28 : 0.13}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

/** Slow motes and a few large soft lights, tinted by whichever faction holds the board. */
function Dust({ reduced, ambient }: { reduced: boolean; ambient: string }) {
  const fine = useRef<THREE.Points>(null),
    soft = useRef<THREE.Points>(null),
    map = blobTexture();
  const N = 70,
    M = 9;
  const seeds = useMemo(
    () =>
      Array.from({ length: N + M }, (_, i) => ({
        x: Math.sin(i * 73) * 6.2,
        y: 0.25 + (((i * 37) % 11) / 11) * 1.1,
        z: Math.cos(i * 39) * 3.2,
        sp: 0.05 + ((i * 13) % 7) / 90,
        ph: i * 1.7,
      })),
    [],
  );
  const fineArr = useMemo(() => new Float32Array(N * 3), []),
    softArr = useMemo(() => new Float32Array(M * 3), []);
  const colour = useMemo(() => new THREE.Color(ambient), []);
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime;
    colour.lerp(new THREE.Color(ambient), 0.04);
    for (const [pts, arr, from, count] of [
      [fine.current, fineArr, 0, N],
      [soft.current, softArr, N, M],
    ] as const) {
      if (!pts) continue;
      for (let k = 0; k < count; k++) {
        const d = seeds[from + k],
          x = ((d.x + t * d.sp * (from ? 1.2 : 2) + 7) % 14.4) - 7.2;
        arr[k * 3] = x;
        arr[k * 3 + 1] = d.y + Math.sin(t * 0.35 + d.ph) * 0.18;
        arr[k * 3 + 2] = d.z + Math.cos(t * 0.22 + d.ph) * 0.25;
      }
      (pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pts.material as THREE.PointsMaterial).color.copy(colour);
    }
  });
  return (
    <>
      <points ref={fine} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[fineArr, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={map}
          color="#d1bd86"
          size={4}
          sizeAttenuation={false}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <points ref={soft} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[softArr, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={map}
          color="#d1bd86"
          size={64}
          sizeAttenuation={false}
          transparent
          opacity={0.07}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}
/** An empty lane: an inset bed, an engraved frame with corner brackets and a small sigil; it breathes when a card could land here. */
function EmptySlot({ ready, reduced }: { ready: boolean; reduced: boolean }) {
  const live = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = live.current;
    if (!g) return;
    const k = ready && !reduced ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 3.2) : ready ? 1 : 0;
    g.children.forEach((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (m) m.opacity = 0.5 * k;
    });
  });
  const w = 1.68,
    h = 2.3,
    b = 0.3,
    t = 0.02,
    col = "#cfae6a";
  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color={ready ? "#2a2113" : "#0b0a08"}
          transparent
          opacity={ready ? 0.5 : 0.38}
        />
      </mesh>
      <Frame color={ready ? "#e2c98c" : col} opacity={ready ? 0.85 : 0.34} />
      <Frame width={1.5} height={2.12} color={col} opacity={0.12} />
      {corners.map(([sx, sz], i) => (
        <group key={i}>
          <mesh
            position={[sx * (w / 2 - b / 2 - 0.07), 0.02, sz * (h / 2 - 0.07)]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[b, t]} />
            <meshBasicMaterial color={col} transparent opacity={0.5} />
          </mesh>
          <mesh
            position={[sx * (w / 2 - 0.07), 0.02, sz * (h / 2 - b / 2 - 0.07)]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[t, b]} />
            <meshBasicMaterial color={col} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 0]}>
        <ringGeometry args={[0.27, 0.285, 48]} />
        <meshBasicMaterial color={col} transparent opacity={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[0, 0.021, 0]}>
        <ringGeometry args={[0.08, 0.095, 4]} />
        <meshBasicMaterial color={col} transparent opacity={0.45} />
      </mesh>
      <group ref={live}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
          <planeGeometry args={[w + 0.14, h + 0.14]} />
          <meshBasicMaterial
            map={blobTexture()}
            color="#e2c98c"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}
function SceneBoard({
  view,
  viewer,
  registry,
  selected,
  attacks,
  blocks,
  targets,
  onSelect,
  onInspect,
  onSlot,
  onHover,
  onDragStart,
  onLayout,
  reduced,
  poses,
  placementSlots,
  ambient = "#d1bd86",
}: {
  placementSlots?: number[];
  ambient?: string;
  poses?: MutableRefObject<Record<string, CardPose>>;
  view: PlayerView;
  viewer: PlayerId;
  registry: Registry;
  selected: string | null;
  attacks: string[];
  blocks: { attacker: string; blocker: string }[];
  targets: string[];
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onSlot: (slot: number) => void;
  onHover: (id: string | null) => void;
  onDragStart?: BoardDragStart;
  onLayout: (slots: SlotLayout[]) => void;
  reduced: boolean;
}) {
  const own: PlayerId = viewer,
    enemy: PlayerId = viewer === "p1" ? "p2" : "p1";
  const effect = usePresentation(view.events, reduced);
  return (
    <Canvas
      orthographic
      camera={{ position: [0, 15, 4.5], near: 0.1, far: 80, zoom: 60 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, alpha: true }}
      aria-label="Three-dimensional battlefield"
    >
      <CameraFit />
      <SlotAnchors viewer={viewer} view={view} attacks={attacks} onLayout={onLayout} />
      <ambientLight intensity={1.2} />
      <directionalLight
        position={[-3, 8, 4]}
        intensity={2}
        color="#c8d4bf"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[13, 7]} />
        <shadowMaterial transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.035, 0]}>
        <ringGeometry args={[2.35, 2.36, 100]} />
        <meshBasicMaterial color="#d2b26c" transparent opacity={0.065} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <ringGeometry args={[1.86, 1.875, 100]} />
        <meshBasicMaterial color="#d2b26c" transparent opacity={0.045} />
      </mesh>
      {[enemy, own].map((side) =>
        view.players[side].board.map((id, slot) => {
          const isOwn = side === own,
            pos = positions(slot, isOwn);
          return id ? (
            <Card
              key={id}
              card={view.cards[id]}
              view={view}
              registry={registry}
              own={isOwn}
              highlight={
                view.legal.energy.some((a) => a.cardId === id) ||
                view.legal.activations.some((a) => a.cardId === id) ||
                view.legal.attackers.includes(id)
              }
              selected={selected === id}
              attacking={attacks.includes(id)}
              blocking={blocks.some((b) => b.blocker === id)}
              targeted={targets.includes(id)}
              onSelect={onSelect}
              onInspect={onInspect}
              onHover={onHover}
              onDragStart={onDragStart}
              reduced={reduced}
              poses={poses}
              pulse={effect?.cardId === id || effect?.target === id ? effect.kind : undefined}
            />
          ) : (
            <group
              key={`slot-${side}-${slot}`}
              position={pos}
              onClick={(e) => {
                e.stopPropagation();
                if (isOwn) onSlot(slot);
              }}
            >
              <EmptySlot
                ready={
                  isOwn &&
                  (placementSlots?.includes(slot) ??
                    (!!selected &&
                      !!view.legal.playable
                        .find((p) => p.cardId === selected)
                        ?.slots.includes(slot)))
                }
                reduced={reduced}
              />
            </group>
          );
        }),
      )}
      <Dust reduced={reduced} ambient={ambient} />
    </Canvas>
  );
}

type BoardProps = Parameters<typeof SceneBoard>[0];
function FlatSlot({
  props,
  side,
  slot,
  id,
}: {
  props: BoardProps;
  side: PlayerId;
  slot: number;
  id: string | null;
}) {
  const hold = useHoldToInspect(() => {
    if (id) props.onInspect(id);
  });
  const appearance = useCardAppearance(
    id ? props.registry.cards[props.view.cards[id].definitionId] : undefined,
  );
  return (
    <button
      data-player={side}
      data-slot={slot}
      className={`flat-slot ${id && props.registry.cards[props.view.cards[id].definitionId].legendary ? "legendary-slot" : ""} ${side === props.viewer ? "own-slot" : "enemy-slot"} ${id && props.attacks.includes(id) ? "attacking-slot" : ""} ${props.selected === id || (side === props.viewer && props.placementSlots?.includes(slot)) ? "active" : ""} ${id && props.view.cards[id].exhausted ? "exhausted-slot" : ""}`}
      onPointerDown={(e) => {
        hold.onPointerDown(e);
        if (id && side === props.viewer) props.onDragStart?.(id, e);
      }}
      onPointerMove={hold.onPointerMove}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerEnter={() => id && props.onHover(id)}
      onPointerLeave={() => {
        hold.onPointerCancel();
        props.onHover(null);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (id) props.onInspect(id);
      }}
      onClick={(e) => {
        if (hold.suppressClick()) return;
        if (id) {
          if (e.shiftKey) props.onInspect(id);
          else props.onSelect(id);
        } else if (side === props.viewer) props.onSlot(slot);
      }}
      aria-label={`${side === props.viewer ? "Your" : "Opponent"} ${positionName(slot)}${id ? `: ${props.registry.cards[props.view.cards[id].definitionId].name}` : ""}`}
    >
      {id ? (
        <CardArtwork
          art={props.registry.cards[props.view.cards[id].definitionId].art}
          animation={props.registry.cards[props.view.cards[id].definitionId].animation}
          playing
          reduced={props.reduced}
        />
      ) : (
        <span>◇</span>
      )}
      {id && appearance !== "original" && (
        <HolographicFoil
          finish={appearance}
          playing
          reduced={props.reduced}
          dimmed={props.view.cards[id].exhausted}
        />
      )}
    </button>
  );
}
function FlatBoard(props: BoardProps) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const rect = root.current!.getBoundingClientRect();
      props.onLayout(
        Array.from(root.current!.querySelectorAll<HTMLElement>("[data-slot]")).map((element) => {
          const box = element.getBoundingClientRect();
          return {
            player: element.dataset.player as PlayerId,
            slot: Number(element.dataset.slot),
            x: box.left - rect.left,
            y: box.top - rect.top,
            width: box.width,
            height: box.height,
          };
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, [props.viewer, props.onLayout, props.attacks.join(",")]);
  return (
    <div ref={root} className="flat-board" aria-label="Battlefield in two-dimensional view">
      {([props.viewer === "p1" ? "p2" : "p1", props.viewer] as PlayerId[]).map((side) => (
        <div className="flat-row" key={side}>
          {props.view.players[side].board.map((id, slot) => (
            <FlatSlot key={slot} props={props} side={side} slot={slot} id={id} />
          ))}
        </div>
      ))}
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function Board(props: BoardProps) {
  return (
    <SceneBoundary fallback={<FlatBoard {...props} />}>
      <SceneBoard {...props} />
    </SceneBoundary>
  );
}
