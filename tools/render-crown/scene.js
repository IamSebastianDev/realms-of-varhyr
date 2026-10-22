import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const FRAMES = 1,
  COLS = 1,
  S = 192;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(S, S, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
const key = new THREE.DirectionalLight("#fff1c8", 3.2);
key.position.set(-3, 4, 4);
scene.add(key);
const rim = new THREE.DirectionalLight("#ffd27a", 1.6);
rim.position.set(4, -2, 2);
scene.add(rim);
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 20);
cam.position.set(0, 0, 6.6);

const gold = new THREE.MeshStandardMaterial({ color: "#e6b84a", metalness: 1, roughness: 0.26 });
const deep = new THREE.MeshStandardMaterial({ color: "#b98424", metalness: 1, roughness: 0.42 });
const bright = new THREE.MeshStandardMaterial({ color: "#ffe08a", metalness: 1, roughness: 0.18 });

const coin = new THREE.Group();
// Body: a lathe profile with a rounded rim and a recessed field on both faces.
const T = 0.27,
  R = 1;
const profile = [
  [0, T - 0.05],
  [0.66, T - 0.05],
  [0.7, T - 0.02],
  [0.7, T],
  [0.86, T],
  [0.94, T - 0.03],
  [R, T - 0.1],
  [R, -T + 0.1],
  [0.94, -T + 0.03],
  [0.86, -T],
  [0.7, -T],
  [0.7, -T + 0.02],
  [0.66, -T + 0.05],
  [0, -T + 0.05],
].map(([x, y]) => new THREE.Vector2(x, y));
const field = new THREE.MeshStandardMaterial({ color: "#8f5d10", metalness: 0.85, roughness: 0.7 });
const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), [gold][0]);
body.rotation.x = Math.PI / 2;
coin.add(body);
// Beaded ring on the rim of the field.
for (const side of [1, -1])
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2,
      bead = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), bright);
    bead.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, side * (T - 0.005));
    bead.scale.z = 0.6;
    coin.add(bead);
  }
// Crown emblem, extruded, on both faces.
const crownShape = new THREE.Shape();
const pts = [
  [-0.42, -0.26],
  [-0.46, 0.2],
  [-0.24, 0.02],
  [0, 0.3],
  [0.24, 0.02],
  [0.46, 0.2],
  [0.42, -0.26],
];
crownShape.moveTo(pts[0][0], pts[0][1]);
for (const [x, y] of pts.slice(1)) crownShape.lineTo(x, y);
crownShape.closePath();
const crownGeo = new THREE.ExtrudeGeometry(crownShape, {
  depth: 0.1,
  bevelEnabled: true,
  bevelThickness: 0.03,
  bevelSize: 0.022,
  bevelSegments: 3,
});
const band = new THREE.ExtrudeGeometry(
  new THREE.Shape([
    new THREE.Vector2(-0.44, -0.36),
    new THREE.Vector2(0.44, -0.36),
    new THREE.Vector2(0.44, -0.29),
    new THREE.Vector2(-0.44, -0.29),
  ]),
  { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 },
);
for (const side of [1, -1]) {
  const emblem = new THREE.Group();
  const c = new THREE.Mesh(crownGeo, bright),
    b = new THREE.Mesh(band, deep);
  emblem.add(c, b);
  for (const [x, y] of [
    [-0.46, 0.2],
    [0, 0.3],
    [0.46, 0.2],
  ]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), bright);
    ball.position.set(x, y + 0.045, 0.045);
    emblem.add(ball);
  }
  emblem.position.z = side === 1 ? T - 0.05 : -(T - 0.05) - 0.1;
  if (side === -1) {
    emblem.rotation.y = Math.PI;
    emblem.position.z = -(T - 0.05);
  }
  emblem.position.y = -0.03;
  coin.add(emblem);
}
for (const side of [1, -1]) {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.69, 64), field);
  disc.position.z = side * (T - 0.046);
  if (side === -1) disc.rotation.y = Math.PI;
  coin.add(disc);
}
scene.add(coin);

const sheet = document.createElement("canvas");
sheet.width = COLS * S;
sheet.height = Math.ceil(FRAMES / COLS) * S;
const ctx = sheet.getContext("2d");
window.renderSheet = () => {
  for (let i = 0; i < FRAMES; i++) {
    coin.rotation.set(-0.14, -0.12 + (i / FRAMES) * Math.PI * 2, 0);
    renderer.render(scene, cam);
    ctx.drawImage(renderer.domElement, (i % COLS) * S, Math.floor(i / COLS) * S);
  }
  return sheet.toDataURL("image/png");
};
