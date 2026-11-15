import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// ---------- helpers ----------
export const tl = new THREE.TextureLoader();
export const draco = new DRACOLoader().setDecoderPath("/draco/");
export const gl = new GLTFLoader().setDRACOLoader(draco);
// Loads a GLB and reports download progress (0..1) when the server announces the size.
// Known sizes are the fallback when the server (gzip/chunked) sends no Content-Length.
export const MODEL_BYTES: Record<string, number> = {
  "/models/lm.glb": 580008,
  "/models/emu.glb": 875664,
  "/models/perseverance.glb": 1937636,
  "/models/iss_hd.glb": 15411000,
};
// Once a model is on the GPU its decoded texture bitmaps are dead weight (~450 MB for the ISS). Close them after upload.
// A bitmap is only closed once every texture sharing it has uploaded. Geometry arrays are NOT freed: Raycaster reads
// position, normal and uv (touch to burn, hover), and freeing them throws on every pick.
function releaseTextureBitmaps(root: THREE.Object3D) {
  const bySource = new Map<unknown, Set<THREE.Texture>>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) for (const v of Object.values(mat as unknown as Record<string, unknown>)) {
      if (!(v instanceof THREE.Texture) || !v.image || typeof (v.image as ImageBitmap).close !== "function") continue;
      let set = bySource.get(v.source);
      if (!set) bySource.set(v.source, (set = new Set()));
      set.add(v);
    }
  });
  for (const [source, textures] of bySource) {
    let pending = textures.size;
    for (const t of textures) {
      const prev = t.onUpdate;
      t.onUpdate = (tex) => {
        prev?.(tex);
        if (--pending === 0) (source as { data?: { close?: () => void } }).data?.close?.();
      };
    }
  }
}

export const loadModel = (url: string, progress: (fraction: number) => void) =>
  gl.loadAsync(url, (e) => {
    const total = e.lengthComputable && e.total ? e.total : MODEL_BYTES[url];
    if (total) progress(e.loaded / total);
  }).then((g) => { releaseTextureBitmaps(g.scene); return g; });

export const tex = async (url: string, srgb = true) => {
  const t = await tl.loadAsync(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};

export const smallScreen = () => typeof window !== "undefined" && window.innerWidth < 768;
export const shadowSize = () => (smallScreen() ? 2048 : 4096);

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const vnoise = (x: number, y: number) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x: number, y: number, oct = 5) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
};

export function stars(n: number, radius: number) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    p.set([radius * s * Math.cos(th), radius * u, radius * s * Math.sin(th)], i * 3);
    const b = 0.35 + Math.pow(Math.random(), 3) * 0.65, k = Math.random();
    c.set([b * (k > 0.7 ? 1 : 0.85 + k * 0.15), b * 0.92, b * (k < 0.3 ? 1 : 0.88)], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
}

export function sunDisc(dir: THREE.Vector3, dist: number, size: number, tint = 0xfff2d8) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size, 32, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(6), toneMapped: false, fog: false }),
  );
  m.position.copy(dir).normalize().multiplyScalar(dist);
  return m;
}

export const atmoMat = (color: THREE.ColorRepresentation, power = 3, bias = 0.72, gain = 1.6) =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uBias: { value: bias }, uGain: { value: gain } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uBias; uniform float uGain; varying vec3 vN;
      void main(){ float i = pow(max(uBias - dot(vN, vec3(0.0,0.0,1.0)), 0.0), uPow); gl_FragColor = vec4(uColor, 1.0) * i * uGain; }`,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });

export async function makeEarth(radius: number, glow = 1.6) {
  const [map, normalMap, specularMap, cloudMap] = await Promise.all([
    tex("/textures/earth.jpg"), tex("/textures/earth_normal.jpg", false), tex("/textures/earth_spec.jpg", false), tex("/textures/earth_clouds.png"),
  ]);
  const g = new THREE.Group();
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 96),
    new THREE.MeshPhongMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), specularMap, specular: new THREE.Color(0x4a5a70), shininess: 22 }),
  );
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.008, 128, 96),
    new THREE.MeshLambertMaterial({ map: cloudMap, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 96, 64), atmoMat(0x4f9bff, 3.2, 0.74, glow));
  g.add(earth, clouds, atmo);
  return { group: g, earth, clouds };
}

export function fitModel(obj: THREE.Object3D, target: number, axis: "x" | "y" | "max" = "max") {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = target / (axis === "max" ? Math.max(size.x, size.y, size.z) : size[axis]);
  obj.scale.multiplyScalar(s);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  return new THREE.Box3().setFromObject(obj);
}

export function shade(obj: THREE.Object3D, envIntensity = 1) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && "envMapIntensity" in mat) mat.envMapIntensity = envIntensity;
    }
  });
}

export type TerrainOpts = { size: number; seg: number; amp: number; freq: number; craters: number; craterMax: number; seed: number; flat: number; low: THREE.Color; high: THREE.Color; roughness: number };

export function makeTerrain(o: TerrainOpts) {
  const r = rng(o.seed);
  const cr = Array.from({ length: o.craters }, () => {
    const rad = 3 + Math.pow(r(), 2.2) * o.craterMax;
    return { x: (r() - 0.5) * o.size * 0.95, z: (r() - 0.5) * o.size * 0.95, r: rad, d: rad * (0.12 + r() * 0.1) };
  });
  const H = (x: number, z: number) => {
    let h = (fbm(x * o.freq + o.seed, z * o.freq + o.seed) - 0.5) * 2 * o.amp;
    h += (fbm(x * o.freq * 6, z * o.freq * 6, 3) - 0.5) * o.amp * 0.12;
    for (const c of cr) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r) h -= c.d * (1 - (d / c.r) ** 2);
      else if (d < c.r * 1.35) h += c.d * 0.28 * (1 - (d - c.r) / (c.r * 0.35));
    }
    const dc = Math.hypot(x, z);
    const k = Math.min(Math.max((dc - o.flat) / (o.flat * 3), 0), 1);
    return h * (k * k * (3 - 2 * k));
  };
  const geo = new THREE.PlaneGeometry(o.size, o.size, o.seg, o.seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = H(x, z);
    pos.setY(i, h);
    const t = Math.min(Math.max(h / (o.amp * 1.2) * 0.5 + 0.5 + (fbm(x * 0.9, z * 0.9, 3) - 0.5) * 0.5, 0), 1);
    tmp.copy(o.low).lerp(o.high, t);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // fine-grain regolith bump
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const cx = cv.getContext("2d")!;
  const img = cx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const v = (vnoise(x / 6, y / 6) * 0.5 + vnoise(x / 2, y / 2) * 0.3 + hash(x, y) * 0.2) * 255;
    const i = (y * 512 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const bump = new THREE.CanvasTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(o.size / 6, o.size / 6);

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness, metalness: 0, bumpMap: bump, bumpScale: 1.2 }));
  mesh.receiveShadow = true;

  // scattered boulders
  const rockN = 420;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: tmp.copy(o.low).multiplyScalar(0.8), roughness: 1, flatShading: true }), rockN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < rockN; i++) {
    let x = (r() - 0.5) * o.size * 0.9, z = (r() - 0.5) * o.size * 0.9;
    if (Math.hypot(x, z) < 5) { x += 12; z += 12; }
    const s = 0.08 + Math.pow(r(), 4) * 1.4;
    e.set(r() * 6, r() * 6, r() * 6); q.setFromEuler(e);
    sc.set(s * (0.8 + r() * 0.6), s * (0.5 + r() * 0.4), s * (0.8 + r() * 0.6));
    p.set(x, H(x, z) + s * 0.15, z);
    rocks.setMatrixAt(i, m4.compose(p, q, sc));
  }
  rocks.castShadow = rocks.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh, rocks);
  return { group: g, H };
}

// Distant mountain ring that hides the terrain edge and gives the horizon some depth.
export function makeRidge(radius: number, height: number, color: number, seed: number, freq = 2.2) {
  const seg = 360;
  const geo = new THREE.CylinderGeometry(radius, radius, 1, seg, 1, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), top = pos.getY(i) > 0;
    const a = Math.atan2(z, x);
    const n = fbm(Math.cos(a) * freq + seed, Math.sin(a) * freq + seed, 5) + 0.35 * fbm(Math.cos(a) * freq * 4 + seed, Math.sin(a) * freq * 4 + seed, 3);
    pos.setY(i, top ? 2 + n * height : -8);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide, flatShading: true }));
  m.receiveShadow = false;
  return m;
}

