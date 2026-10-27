import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** What the pack face is stamped with: SVG path geometry (24 or 64 units wide) or a text glyph. */
export type PackSymbol = { paths: readonly string[]; box: number } | { text: string } | null;
/** Small code-driven differences between packs that share one authored model. */
export type PackVariant = {
  width: number;
  height: number;
  thin: number;
  seal: "ribs" | "zigzag" | "teeth";
  finish: "foil" | "satin" | "matte";
};
export const plainVariant: PackVariant = {
  width: 1,
  height: 1,
  thin: 1,
  seal: "ribs",
  finish: "foil",
};
export type CarouselPack = {
  id: string;
  color: string;
  name: string;
  symbol: PackSymbol;
  /** Printed on the pack front; the generated foil look is used without it. */ art?: string;
  /** Which authored model this pack uses. */ model: string;
  variant: PackVariant;
  /** Shown as this many packs piled on one another. */ stack?: number;
};

const FACE = { w: 768, h: 1280 };
/** The authored models are about 1.1 x 1.9 x 0.5; they are scaled up and flattened into a slim sachet. */
export const SIZE = 1.3,
  THIN = 0.45;

function mix(hex: string, other: string, amount: number) {
  const a = new THREE.Color(hex),
    b = new THREE.Color(other);
  return `#${a.lerp(b, amount).getHexString()}`;
}
const rgba = (hex: string, alpha: number) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
};

function lines(name: string) {
  const out: string[] = [];
  for (const word of name.toUpperCase().split(" ")) {
    const last = out[out.length - 1];
    if (last && (last + " " + word).length <= 12) out[out.length - 1] = last + " " + word;
    else out.push(word);
  }
  return out;
}

function drawFace(
  canvas: HTMLCanvasElement,
  color: string,
  name: string,
  tagline: string,
  symbol: PackSymbol,
  image: HTMLImageElement | null,
  sealStyle: PackVariant["seal"],
) {
  const ctx = canvas.getContext("2d")!,
    { w, h } = FACE;
  const serif =
    getComputedStyle(document.body).getPropertyValue("--serif").trim() ||
    "'Cormorant Garamond', Georgia, serif";
  ctx.clearRect(0, 0, w, h);
  if (image) {
    // Printed artwork, cropped to fill, with shade behind the lettering.
    const fit = Math.max(w / image.naturalWidth, h / image.naturalHeight),
      iw = image.naturalWidth * fit,
      ih = image.naturalHeight * fit;
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
    const top = ctx.createLinearGradient(0, 0, 0, 380);
    top.addColorStop(0, "rgba(6,12,9,.82)");
    top.addColorStop(1, "rgba(6,12,9,0)");
    const bottom = ctx.createLinearGradient(0, 640, 0, h);
    bottom.addColorStop(0, "rgba(6,12,9,0)");
    bottom.addColorStop(0.45, "rgba(6,12,9,.72)");
    bottom.addColorStop(1, "rgba(6,12,9,.94)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, 380);
    ctx.fillStyle = bottom;
    ctx.fillRect(0, 640, w, h - 640);
  } else {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, mix(color, "#050d09", 0.78));
    base.addColorStop(0.45, mix(color, "#07110c", 0.5));
    base.addColorStop(1, mix(color, "#040a07", 0.82));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.42, 20, w / 2, h * 0.42, w * 0.8);
    glow.addColorStop(0, rgba(color, 0.55));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // Foil sheen: soft diagonal bands.
    ctx.save();
    ctx.rotate(-0.5);
    for (let i = -3; i < 8; i++) {
      const x = i * 190 + 40;
      const band = ctx.createLinearGradient(x, 0, x + 120, 0);
      band.addColorStop(0, "rgba(255,255,255,0)");
      band.addColorStop(0.5, "rgba(255,255,255,.07)");
      band.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x, -200, 120, h + 700);
    }
    ctx.restore();
  }
  // Crimped seals.
  const seal = 96;
  for (const y of [0, h - seal]) {
    ctx.fillStyle = image ? "rgba(0,0,0,.1)" : "rgba(0,0,0,.28)";
    ctx.fillRect(0, y, w, seal);
    if (sealStyle === "ribs")
      for (let x = 0; x < w; x += 9) {
        ctx.fillStyle = x % 18 ? "rgba(255,255,255,.09)" : `rgba(0,0,0,${image ? 0.1 : 0.22})`;
        ctx.fillRect(x, y, 4, seal);
      }
    else if (sealStyle === "zigzag") {
      ctx.lineWidth = 5;
      ctx.lineJoin = "miter";
      for (let row = 10; row < seal; row += 18) {
        ctx.strokeStyle = row % 36 < 18 ? "rgba(255,255,255,.13)" : "rgba(0,0,0,.2)";
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + row + (x % 32 ? 7 : -7));
        ctx.stroke();
      }
    } else {
      const down = y === 0;
      ctx.fillStyle = `rgba(0,0,0,${image ? 0.22 : 0.32})`;
      for (let x = 0; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, down ? y : y + seal);
        ctx.lineTo(x + 32, down ? y : y + seal);
        ctx.lineTo(x + 16, down ? y + seal * 0.6 : y + seal * 0.4);
        ctx.fill();
      }
    }
  }
  const gold = "#e9d28f";
  ctx.strokeStyle = rgba(gold, 0.75);
  ctx.lineWidth = 5;
  ctx.strokeRect(46, seal + 36, w - 92, h - 2 * seal - 72);
  ctx.strokeStyle = rgba(gold, 0.3);
  ctx.lineWidth = 2;
  ctx.strokeRect(64, seal + 54, w - 128, h - 2 * seal - 108);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f3e4b4";
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 10;
  ctx.font = `600 34px ${serif}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "9px";
  ctx.fillText("REALMS OF VARHYR", w / 2 + 4, seal + 104);
  // Emblem.
  const cx = w / 2,
    cy = image ? 690 : 520,
    ring = image ? 84 : 176;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba(color, 0.95);
  ctx.lineWidth = 6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-ring * 0.72, -ring * 0.72, ring * 1.44, ring * 1.44);
  ctx.restore();
  ctx.strokeStyle = rgba(gold, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, ring, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = mix(color, "#ffffff", 0.35);
  ctx.shadowColor = rgba(color, 0.9);
  ctx.shadowBlur = 26;
  if (symbol && "paths" in symbol) {
    const size = image ? 96 : 200;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / symbol.box, size / symbol.box);
    for (const d of symbol.paths) ctx.fill(new Path2D(d), "evenodd");
    ctx.restore();
  } else if (symbol) {
    ctx.font = `500 ${image ? 90 : 190}px ${serif}`;
    ctx.fillText(symbol.text, cx, cy + 6);
  }
  // Name.
  ctx.shadowBlur = 12;
  ctx.shadowColor = "rgba(0,0,0,.85)";
  ctx.fillStyle = "#fff0c9";
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "5px";
  const rows = lines(name),
    size = image ? 62 : rows.some((row) => row.length > 10) ? 66 : 76,
    top = image ? 800 : 820,
    step = image ? 72 : size + 12;
  ctx.font = `700 ${size}px ${serif}`;
  rows.forEach((row, index) => ctx.fillText(row, cx + 2, top + index * step));
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(gold, 0.9);
  ctx.font = `600 30px ${serif}`;
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "8px";
  ctx.fillText(tagline.toUpperCase(), cx + 4, h - seal - 104);
}

export function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl),
      room = new RoomEnvironment(),
      target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  return null;
}

const SPACING = 2.9,
  REACH = 3;
const mod = (value: number, size: number) => ((value % size) + size) % size;

export type Model = { geometry: THREE.BufferGeometry };
/** The authored models carry geometry only, so normals, front/back/side groups and face UVs are made here. */
export function prepare(source: THREE.BufferGeometry): Model {
  const smooth = source.clone();
  smooth.computeVertexNormals();
  const flat = smooth.toNonIndexed();
  smooth.dispose();
  flat.computeBoundingBox();
  const box = flat.boundingBox!,
    width = box.max.x - box.min.x,
    height = box.max.y - box.min.y;
  const pos = flat.attributes.position,
    uv = new Float32Array(pos.count * 2),
    groups: number[][] = [[], [], []];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let tri = 0; tri < pos.count / 3; tri++) {
    a.fromBufferAttribute(pos, tri * 3);
    b.fromBufferAttribute(pos, tri * 3 + 1);
    c.fromBufferAttribute(pos, tri * 3 + 2);
    const nz = b.clone().sub(a).cross(c.clone().sub(a)).normalize().z,
      kind = nz > 0.15 ? 0 : nz < -0.15 ? 1 : 2;
    groups[kind].push(tri);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k],
        u = (v.x - box.min.x) / width;
      uv[(tri * 3 + k) * 2] = kind === 1 ? 1 - u : u;
      uv[(tri * 3 + k) * 2 + 1] = (v.y - box.min.y) / height;
    }
  }
  flat.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const index: number[] = [];
  let start = 0;
  flat.clearGroups();
  groups.forEach((list, material) => {
    for (const tri of list) index.push(tri * 3, tri * 3 + 1, tri * 3 + 2);
    flat.addGroup(start, list.length * 3, material);
    start += list.length * 3;
  });
  flat.setIndex(index);
  return { geometry: flat };
}

/** Pack artwork is loaded once and kept, so a pack is painted with its art from its first frame. */
const artImages = new Map<string, HTMLImageElement>();
export function loadArt(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const hit = artImages.get(src);
    if (hit) {
      resolve(hit);
      return;
    }
    const image = new Image();
    image.onload = () => {
      artImages.set(src, image);
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** One painted face per pack; slots of the same pack share it. */
export function usePackArt(packs: CarouselPack[], tagline: string) {
  const invalidate = useThree((state) => state.invalidate);
  const key =
    packs
      .map((pack) => `${pack.id}${pack.color}${pack.name}${pack.art ?? ""}${pack.variant.seal}`)
      .join("|") + tagline;
  const art = useMemo(
    () =>
      packs.map((pack) => {
        const face = document.createElement("canvas");
        face.width = FACE.w;
        face.height = FACE.h;
        drawFace(
          face,
          pack.color,
          pack.name,
          tagline,
          pack.symbol,
          pack.art ? (artImages.get(pack.art) ?? null) : null,
          pack.variant.seal,
        );
        const map = new THREE.CanvasTexture(face);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
        return { face, map };
      }),
    [packs.length],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    const paint = () => {
      packs.forEach((pack, index) => {
        drawFace(
          art[index].face,
          pack.color,
          pack.name,
          tagline,
          pack.symbol,
          pack.art ? (artImages.get(pack.art) ?? null) : null,
          pack.variant.seal,
        );
        art[index].map.needsUpdate = true;
      });
      invalidate();
    };
    paint();
    void document.fonts?.ready.then(() => {
      if (live) paint();
    });
    for (const src of new Set(
      packs.flatMap((pack) => (pack.art && !artImages.has(pack.art) ? [pack.art] : [])),
    ))
      void loadArt(src).then(() => {
        if (live) paint();
      });
    return () => {
      live = false;
    };
  }, [art, key, invalidate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => art.forEach((item) => item.map.dispose()), [art]);
  return art;
}

export type Art = ReturnType<typeof usePackArt>[number];
type SlotProps = {
  variant: PackVariant;
  offset: number;
  art: Art;
  color: string;
  current: { value: number };
  model: Model;
  reduced: boolean;
  pick: (offset: number) => void;
  stack?: number;
  /** Lays the row out around this offset instead of around the one in front; the front one is then marked by its glow. */
  center?: number;
};

const finishes = {
  foil: { metalness: 0.15, roughness: 0.45, clearcoat: 0.3, envMapIntensity: 0.35 },
  satin: { metalness: 0.05, roughness: 0.6, clearcoat: 0.1, envMapIntensity: 0.28 },
  matte: { metalness: 0, roughness: 0.8, clearcoat: 0, envMapIntensity: 0.15 },
};
/** The three materials of a pack: printed front, printed back, and the plain rim. */
export const packMaterials = (map: THREE.Texture, color: string, finish: PackVariant["finish"]) => {
  const printed = () =>
    new THREE.MeshPhysicalMaterial({
      map,
      ...finishes[finish],
      clearcoatRoughness: 0.35,
      transparent: true,
    });
  return [
    printed(),
    printed(),
    new THREE.MeshStandardMaterial({
      color: mix(color, "#0b110d", 0.35),
      metalness: 0.7,
      roughness: 0.38,
      transparent: true,
    }),
  ];
};

let glowMap: THREE.CanvasTexture | null = null;
/** A soft round pool of light, white in the middle and clear at the edge, tinted per pack by its material. */
function glowTexture() {
  if (glowMap) return glowMap;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!,
    gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return (glowMap = new THREE.CanvasTexture(canvas));
}

function Slot({
  variant,
  offset,
  art,
  color,
  current,
  model,
  reduced,
  pick,
  stack = 1,
  center,
}: SlotProps) {
  const glow = useRef<THREE.Mesh>(null);
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color],
  );
  useEffect(() => () => glowMaterial.dispose(), [glowMaterial]);
  const group = useRef<THREE.Group>(null),
    gl = useThree((state) => state.gl);
  const materials = useMemo(
    () => packMaterials(art.map, color, variant.finish),
    [art, color, variant.finish],
  );
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const rel = offset - current.value,
      near = Math.abs(rel),
      focus = Math.max(0, 1 - near),
      t = state.clock.elapsedTime,
      { x: pointerX, y } = state.pointer;
    const x = rel * SPACING;
    if (glow.current) {
      glow.current.position.set(x, -1.2, -0.3);
      glowMaterial.opacity = center === undefined ? 0 : focus * 0.55;
    }
    const still = center !== undefined; // The store shows its packs at rest.
    g.position.set(
      x,
      still ? 0 : focus * (reduced ? 0 : Math.sin(t * 1.1) * 0.05),
      -Math.min(near, 2) * 0.9,
    );
    g.scale.setScalar(1 - Math.min(near, 1) * 0.2);
    const sway = still ? 0.28 : (reduced ? 0.28 : Math.sin(t * 0.6) * 0.32) + pointerX * 0.55;
    const aimY = focus * sway + (1 - focus) * -Math.sign(rel) * 0.45,
      aimX = focus * (still ? 0.06 : 0.06 - y * 0.22);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, aimY, 5, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, aimX, 5, delta);
    const opacity = near < 1 ? 1 - near * 0.4 : Math.max(0, 0.6 - (near - 1) * 0.3);
    for (const material of materials) {
      material.opacity = opacity;
      // Solid while fully shown, so the layers of a pile hide one another instead of blending.
      material.transparent = opacity < 0.995;
      material.depthWrite = !material.transparent;
    }
    g.visible = opacity > 0.01;
  });
  const side = () => Math.round(current.value) !== offset;
  return (
    <>
      {center !== undefined && (
        <mesh ref={glow} rotation={[-1.2, 0, 0]} material={glowMaterial}>
          <planeGeometry args={[3.2, 1.5]} />
        </mesh>
      )}
      <group
        ref={group}
        onClick={(event) => {
          if (side()) {
            event.stopPropagation();
            pick(offset);
          }
        }}
        onPointerOver={() => {
          if (side()) gl.domElement.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
        }}
      >
        {stack === 1 ? (
          <mesh
            geometry={model.geometry}
            material={materials}
            scale={[SIZE * variant.width, SIZE * variant.height, SIZE * THIN * variant.thin]}
          />
        ) : (
          <Pile
            count={stack}
            geometry={model.geometry}
            materials={materials}
            scale={[SIZE * variant.width, SIZE * variant.height, SIZE * THIN * variant.thin]}
          />
        )}
      </group>
    </>
  );
}

/** Nine packs lying on one another and the tenth standing in front, leaning back against the pile's edge, all on one floor. */
function Pile({
  count,
  geometry,
  materials,
  scale,
}: {
  count: number;
  geometry: THREE.BufferGeometry;
  materials: THREE.Material[];
  scale: [number, number, number];
}) {
  const shadow = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#000000",
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => shadow.dispose(), [shadow]);
  // The real size of one pack after scaling: width, length and thickness.
  const size = useMemo(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    return {
      w: (box.max.x - box.min.x) * scale[0],
      l: (box.max.y - box.min.y) * scale[1],
      t: (box.max.z - box.min.z) * scale[2],
    };
  }, [geometry, scale[0], scale[1], scale[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const flat = count - 1,
    FLOOR = -1.05,
    LAYER = size.t * 0.55, // Packs are soft: laid on one another they sink into each other.
    LEAN = 0.3,
    pileX = -size.w * 0.425,
    height = size.t * 0.5 + (flat - 1) * LAYER + size.t * 0.5,
    frontEdge = size.l / 2,
    footZ = frontEdge + height * Math.tan(LEAN) + 0.02;
  return (
    <group scale={0.64} rotation={[0.38, 0.0, 0]} position={[0, 0.1, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.1, FLOOR - 0.01, 0.3]} material={shadow}>
        <planeGeometry args={[size.w * 2.6, size.l * 1.35]} />
      </mesh>
      {Array.from({ length: flat }, (_, index) => {
        // A little drift per layer so it reads as a handled stack rather than a printed block.
        const drift = Math.sin(index * 12.9898) * 0.25;
        return (
          <mesh
            key={index}
            geometry={geometry}
            material={materials}
            position={[pileX + drift * 0.04, FLOOR + size.t * 0.5 + index * LAYER, drift * 0.05]}
            rotation={[-Math.PI / 2, 0, drift * 0.03]}
            scale={scale}
          />
        );
      })}
      <mesh
        geometry={geometry}
        material={materials}
        position={[
          pileX + size.w * 0.85,
          FLOOR + (size.l / 2) * Math.cos(LEAN) + (size.t / 2) * Math.sin(LEAN),
          footZ - (size.l / 2) * Math.sin(LEAN) + (size.t / 2) * Math.cos(LEAN),
        ]}
        rotation={[-LEAN, 0.04, 0]}
        scale={scale}
      />
    </group>
  );
}

function Row({
  packs,
  tagline,
  position,
  pick,
  reduced,
  linear,
}: {
  linear?: boolean;
  packs: CarouselPack[];
  tagline: string;
  position: number;
  pick: (offset: number) => void;
  reduced: boolean;
}) {
  const art = usePackArt(packs, tagline);
  const urls = [...new Set(packs.map((pack) => pack.model))];
  const loaded = useLoader(GLTFLoader, urls);
  const models = useMemo(
    () =>
      new Map(
        urls.map((url, index) => [
          url,
          prepare(
            (
              loaded[index].scene.children.find(
                (child) => (child as THREE.Mesh).isMesh,
              ) as THREE.Mesh
            ).geometry,
          ),
        ]),
      ),
    [loaded],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => models.forEach((model) => model.geometry.dispose()), [models]);
  const current = useRef({ value: position }),
    target = useRef(position);
  target.current = position;
  useFrame((_, delta) => {
    current.current.value = THREE.MathUtils.damp(
      current.current.value,
      target.current,
      reduced ? 16 : 5,
      delta,
    );
  });
  const span = packs.length === 1 ? 0 : REACH;
  // A short row is laid out once, left to right, instead of repeating around the middle.
  const offsets = linear
    ? Array.from({ length: packs.length }, (_, index) => index)
    : Array.from({ length: span * 2 + 1 }, (_, index) => position - span + index);
  return (
    <>
      {offsets.map((offset) => {
        const index = mod(offset, packs.length);
        return (
          <Slot
            key={offset}
            variant={packs[index].variant}
            stack={packs[index].stack}
            center={linear ? (packs.length - 1) / 2 : undefined}
            offset={offset}
            art={art[index]}
            color={packs[index].color}
            current={current.current}
            model={models.get(packs[index].model)!}
            reduced={reduced}
            pick={pick}
          />
        );
      })}
    </>
  );
}

/** An endless row of lit foil boosters; the one at `position` faces front and the rest recede. */
export default function BoosterCarousel3D({
  packs,
  tagline,
  position,
  pick,
  reduced,
  linear,
}: {
  packs: CarouselPack[];
  tagline: string;
  position: number;
  pick: (offset: number) => void;
  reduced: boolean;
  linear?: boolean;
}) {
  return (
    <Canvas
      resize={{ offsetSize: true }}
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.8], fov: 28 }}
      gl={{ antialias: true, alpha: true }}
      style={{ touchAction: "pan-y" }}
    >
      <PackLighting color={packs[mod(position, packs.length)].color} />
      <Row
        packs={packs}
        tagline={tagline}
        position={position}
        pick={pick}
        reduced={reduced}
        linear={linear}
      />
    </Canvas>
  );
}

function PackLighting({ color }: { color: string }) {
  return (
    <>
      <Environment />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-3, -2, 3]} intensity={8} color={color} />
    </>
  );
}

/** A reward bundle uses exactly the store's authored geometry, printed textures, materials and lighting. */
function RewardBundle({
  pack,
  count,
  tagline,
  reduced,
}: {
  pack: CarouselPack;
  count: number;
  tagline: string;
  reduced: boolean;
}) {
  const art = usePackArt([pack], tagline)[0];
  const loaded = useLoader(GLTFLoader, pack.model);
  const model = useMemo(
    () =>
      prepare(
        (loaded.scene.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh)
          .geometry,
      ),
    [loaded],
  );
  const materials = useMemo(
    () => packMaterials(art.map, pack.color, pack.variant.finish),
    [art, pack.color, pack.variant.finish],
  );
  const root = useRef<THREE.Group>(null);
  useEffect(() => () => model.geometry.dispose(), [model]);
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials]);
  useFrame((state, delta) => {
    if (!root.current || reduced) return;
    root.current.rotation.y = THREE.MathUtils.damp(
      root.current.rotation.y,
      Math.sin(state.clock.elapsedTime * 0.55) * 0.1 + state.pointer.x * 0.2,
      5,
      delta,
    );
    root.current.rotation.x = THREE.MathUtils.damp(
      root.current.rotation.x,
      -state.pointer.y * 0.1,
      5,
      delta,
    );
  });
  const copies = Math.min(3, Math.max(1, count)),
    { width, height, thin } = pack.variant;
  return (
    <group ref={root}>
      {Array.from({ length: copies }, (_, index) => {
        const offset = index - (copies - 1) / 2;
        return (
          <mesh
            key={index}
            geometry={model.geometry}
            material={materials}
            position={[offset * 0.83, -Math.abs(offset) * 0.08, -Math.abs(offset) * 0.35]}
            rotation={[0.05, offset * -0.2, offset * -0.14]}
            scale={[SIZE * width, SIZE * height, SIZE * THIN * thin]}
          />
        );
      })}
    </group>
  );
}

export function BoosterReward3D({
  pack,
  count,
  tagline,
  reduced,
}: {
  pack: CarouselPack;
  count: number;
  tagline: string;
  reduced: boolean;
}) {
  return (
    <Canvas
      resize={{ offsetSize: true }}
      flat
      frameloop={reduced ? "demand" : "always"}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.8], fov: 28 }}
      gl={{ antialias: true, alpha: true }}
    >
      <PackLighting color={pack.color} />
      <RewardBundle pack={pack} count={count} tagline={tagline} reduced={reduced} />
    </Canvas>
  );
}
