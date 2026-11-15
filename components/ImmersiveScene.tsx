"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { useLang } from "@/lib/i18n";
import { createHyperFire, type FireMount, type FireParams, type HyperFire } from "@/lib/hyperFire";
import {
  loadModel,
  tex,
  smallScreen,
  shadowSize,
  rng,
  hash,
  vnoise,
  fbm,
  stars,
  sunDisc,
  atmoMat,
  makeEarth,
  fitModel,
  shade,
  makeTerrain,
  makeRidge,
} from "@/lib/sceneKit";

export type ImmersiveEnv = "earth" | "moon" | "mars" | "iss" | "suit";

/** What the Fire Lab gets once a scene is built: enough to add its own flames, smoke and surface decals. */
export type SceneApi = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** objects the tap-to-ignite ray must skip (the lab's own flames and decals) */
  ignore: THREE.Object3D[];
  /** called every frame after the scene update; pxPerUnit is what hyperFire.update expects */
  addUpdater: (fn: (dt: number, t: number, camera: THREE.PerspectiveCamera, pxPerUnit: number) => void) => void;
  /** first mesh under a pointer position, skipping `ignore` */
  raycast: (clientX: number, clientY: number) => { point: THREE.Vector3; normal: THREE.Vector3; name: string; material: string } | null;
};
/** `material` is the name of the material that was hit (empty when it has none): the models identify parts by material or by mesh name */
export type PickInfo = { normal: [number, number, number]; name: string; material?: string };

type Built = {
  update: (dt: number, t: number) => void;
  cam: { pos: [number, number, number]; target: [number, number, number]; min: number; max: number; maxPolar?: number; autoRotate?: number };
  bloom: [number, number, number]; // strength, radius, threshold
  exposure: number;
  shadows?: boolean;
  /** freeze any slow motion of the scene (a fire started by touch must stay on the part that was touched) */
  pin?: () => void;
  /** where the fire burns in this place, and where the camera goes to look at it */
  fire?: { pos: [number, number, number]; scale: number; mount: FireMount; light?: number; bloom?: number; cam: { pos: [number, number, number]; target: [number, number, number] } };
};

type Ctx = { scene: THREE.Scene; renderer: THREE.WebGLRenderer; progress: (fraction: number) => void };

// ---------- scene builders ----------
async function buildEarth({ scene }: Ctx): Promise<Built> {
  scene.background = new THREE.Color(0x000004);
  scene.add(stars(5000, 900));
  scene.add(new THREE.AmbientLight(0x0b1226, 0.9));
  const sun = new THREE.DirectionalLight(0xfff4e0, 3.4);
  sun.position.set(-40, 14, 30);
  scene.add(sun);
  const { group, earth, clouds } = await makeEarth(5);
  // names the component engine resolves a tap by (see data/components/earth-planet.map.json)
  earth.name = "earthplanet_surface";
  clouds.name = "earthplanet_clouds";
  scene.add(group);
  let pinned = false;
  return {
    update: (dt) => { if (pinned) return; earth.rotation.y += dt * 0.04; clouds.rotation.y += dt * 0.052; },
    pin: () => { pinned = true; },
    cam: { pos: [0, 2.5, 15], target: [0, 0, 0], min: 7.5, max: 40, autoRotate: 0.25 },
    bloom: [0.3, 0.6, 0.85], exposure: 1.05,
  };
}

async function buildMoon({ scene, progress }: Ctx): Promise<Built> {
  scene.background = new THREE.Color(0x000000);
  scene.add(stars(6000, 900));
  const sunDir = new THREE.Vector3(0.85, 0.2, 0.45).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 4.6);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x1b2a44, 0x050505, 0.18)); // earthshine
  scene.add(sunDisc(sunDir, 700, 12, 0xffffff));

  const { group: terr, H } = makeTerrain({ size: 260, seg: 320, amp: 3.2, freq: 0.022, craters: 46, craterMax: 22, seed: 7, flat: 7, low: new THREE.Color(0x4d4b48), high: new THREE.Color(0x9a9791), roughness: 1 });
  terr.name = "moon_ground";
  scene.add(terr);
  const ridge = makeRidge(165, 16, 0x6b6966, 3);
  ridge.name = "moon_ridge";
  scene.add(ridge);

  const [earth, lm] = await Promise.all([makeEarth(26), loadModel("/models/lm.glb", progress)]);
  earth.group.position.set(-260, 150, -430);
  earth.group.rotation.set(0.2, 2.2, 0.1);
  scene.add(earth.group);

  const m = lm.scene;
  const box = fitModel(m, 8);
  m.position.y += H(0, 0) - box.min.y + 0.05;
  shade(m, 0.3);
  scene.add(m);

  return {
    update: (dt) => { earth.clouds.rotation.y += dt * 0.01; },
    cam: { pos: [13, 3.2, 15], target: [0, 3, 0], min: 5, max: 70, maxPolar: Math.PI / 2 - 0.03 },
    bloom: [0.35, 0.5, 0.92], exposure: 0.95, shadows: true,
    fire: { pos: [5.4, H(5.4, 3.4) + 0.45, 3.4], scale: 1.5, mount: "pan", cam: { pos: [8.6, 1.9, 8.2], target: [5.4, 1.1, 3.4] } },
  };
}

async function buildMars({ scene, progress }: Ctx): Promise<Built> {
  const horizon = new THREE.Color(0xd9a074), zenith = new THREE.Color(0x7d6a68);
  scene.background = horizon.clone();
  scene.fog = new THREE.FogExp2(0xc78e62, 0.0085);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { h: { value: horizon }, z: { value: zenith } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 h; uniform vec3 z; varying vec3 vP; void main(){ float t = pow(clamp(vP.y,0.0,1.0), 0.55); gl_FragColor = vec4(mix(h, z, t), 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  scene.add(sky);
  const sunDir = new THREE.Vector3(-0.7, 0.42, -0.55).normalize();
  const sun = new THREE.DirectionalLight(0xffe2bd, 3.1);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 });
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xd8a37c, 0x5a2e1c, 0.75));
  scene.add(sunDisc(sunDir, 800, 11, 0xffe9cc));

  const { group: terr, H } = makeTerrain({ size: 300, seg: 320, amp: 4.5, freq: 0.018, craters: 22, craterMax: 18, seed: 21, flat: 6, low: new THREE.Color(0x6e3a22), high: new THREE.Color(0xbb7a4c), roughness: 0.95 });
  terr.name = "mars_ground";
  scene.add(terr);
  const ridgeM = makeRidge(185, 22, 0x8f5535, 11, 1.8);
  ridgeM.name = "mars_ridge";
  scene.add(ridgeM);

  const rover = (await loadModel("/models/perseverance.glb", progress)).scene;
  const box = fitModel(rover, 4.2);
  rover.position.y += H(0, 0) - box.min.y;
  rover.rotation.y = 0.6;
  shade(rover, 0.4);
  scene.add(rover);

  // wind-blown dust
  const n = 900, dp = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) dp.set([(r() - 0.5) * 90, r() * 12, (r() - 0.5) * 90], i * 3);
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xe0a679, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false })));

  return {
    update: (dt, t) => {
      const a = dg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) {
        let x = a.getX(i) + dt * 1.6;
        const y = a.getY(i) + Math.sin(t + i) * dt * 0.05;
        if (x > 45) x -= 90;
        a.setXYZ(i, x, y, a.getZ(i));
      }
      a.needsUpdate = true;
    },
    cam: { pos: [7.5, 2.6, 9], target: [0, 1.3, 0], min: 4, max: 45, maxPolar: Math.PI / 2 - 0.03 },
    bloom: [0.28, 0.6, 0.9], exposure: 1.0, shadows: true,
    fire: { pos: [3.5, H(3.5, 3.0) + 0.33, 3.0], scale: 1.1, mount: "pan", cam: { pos: [6.1, 1.5, 6.3], target: [3.5, 0.9, 3.0] } },
  };
}

async function buildIss({ scene, progress }: Ctx): Promise<Built> {
  scene.background = new THREE.Color(0x000003);
  scene.add(stars(6000, 1800));
  scene.add(new THREE.AmbientLight(0x1a2440, 0.7));
  const sunDir = new THREE.Vector3(0.9, 0.5, 0.55).normalize();
  const sun = new THREE.DirectionalLight(0xfff6e8, 4.2);
  sun.position.copy(sunDir).multiplyScalar(100);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 240 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0003;
  scene.add(sun);

  const [earth, iss] = await Promise.all([makeEarth(240, 0.22), loadModel("/models/iss_hd.glb", progress)]);
  earth.group.position.set(0, -285, -10);
  earth.group.rotation.set(0.15, 0.9, 0);
  scene.add(earth.group);
  const m = iss.scene;
  fitModel(m, 23);
  m.position.y -= new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).y;
  shade(m, 0.6);
  scene.add(m);
  let pinned = false;

  return {
    update: (dt, t) => { if (!pinned) { m.rotation.y = t * 0.03; m.rotation.z = Math.sin(t * 0.05) * 0.03; } earth.earth.rotation.y += dt * 0.006; earth.clouds.rotation.y += dt * 0.008; },
    pin: () => { pinned = true; },
    cam: { pos: [19, 3, 27], target: [0, -3.5, 0], min: 8, max: 120, autoRotate: 0.18 },
    bloom: [0.32, 0.6, 0.9], exposure: 1.0, shadows: true,
  };
}

// Sokol-type intravehicular pressure suit, modelled procedurally from a reference photo.
function makeSokolSuit() {
  const g = new THREE.Group();

  // fabric weave bump
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const cx = cv.getContext("2d")!;
  const img = cx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 150 + hash(x, y) * 60 + (x % 4 < 2 ? 18 : 0) + (y % 4 < 2 ? 18 : 0);
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const weave = new THREE.CanvasTexture(cv);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(10, 10);

  const cream = new THREE.MeshStandardMaterial({ color: 0xe9e6db, roughness: 0.92, bumpMap: weave, bumpScale: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.9, bumpMap: weave, bumpScale: 0.4 });
  const tan = new THREE.MeshStandardMaterial({ color: 0xcfc1a0, roughness: 0.95, bumpMap: weave, bumpScale: 0.6 });
  const cord = new THREE.MeshStandardMaterial({ color: 0x3e64c8, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x1b55c0, roughness: 0.3, metalness: 0.75 });
  const black = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.2, clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false });
  const add = (m: THREE.Mesh, parent: THREE.Object3D = g) => { m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const cyl = (rt: number, rb: number, h: number, yTop: number, mat: THREE.Material, parent: THREE.Object3D, seg = 28) => {
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), parent);
    m.position.y = yTop - h / 2;
    return m;
  };
  const ring = (r: number, tube: number, y: number, mat: THREE.Material, parent: THREE.Object3D, sx = 1, sz = 1) => {
    const m = add(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 40), mat), parent);
    m.rotation.x = Math.PI / 2; m.position.y = y; m.scale.set(sx, sz, 1);
    return m;
  };
  const strap = (a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material) => {
    const d = b.clone().sub(a), len = d.length();
    const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.01), mat));
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return m;
  };

  // legs, knees, boots
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.x = s * 0.105;
    g.add(leg);
    cyl(0.088, 0.078, 0.44, 0.52, cream, leg).position.y += 0;
    cyl(0.125, 0.105, 0.44, 0.96, cream, leg);
    for (let i = 0; i < 6; i++) ring(0.092, 0.009, 0.46 + i * 0.03, white, leg, 1, 1.05);
    const boot = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.14, 6, 14), tan), leg);
    boot.rotation.x = Math.PI / 2; boot.position.set(0, 0.065, 0.045);
    ring(0.082, 0.012, 0.16, metal, leg);
  }

  // hips and torso
  const hips = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 20), cream));
  hips.scale.set(1.12, 0.8, 0.78); hips.position.y = 0.99;
  const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 8, 24), cream));
  torso.scale.set(1.38, 1, 0.86); torso.position.y = 1.3;
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 14), cream)).position.set(s * 0.255, 1.47, 0);

  // chest hardware: V harness, connector, crotch flap, waist ports, stripes
  strap(new THREE.Vector3(-0.135, 1.5, 0.16), new THREE.Vector3(0, 1.1, 0.172), 0.018, black);
  strap(new THREE.Vector3(0.135, 1.5, 0.16), new THREE.Vector3(0, 1.1, 0.172), 0.018, black);
  const conn = add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.035, 28), metal));
  conn.rotation.x = Math.PI / 2; conn.position.set(0, 1.4, 0.165);
  const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.045, 16), metal));
  knob.rotation.x = Math.PI / 2; knob.position.set(0, 1.4, 0.18);
  const tri = new THREE.Shape();
  tri.moveTo(-0.14, 0); tri.lineTo(0.14, 0); tri.lineTo(0.02, -0.22); tri.lineTo(-0.02, -0.22); tri.closePath();
  const flap = add(new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.012, bevelEnabled: false }), white));
  flap.position.set(0, 1.16, 0.168);
  for (const s of [-1, 1]) {
    const port = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.08, 20), metal));
    port.rotation.z = Math.PI / 2; port.rotation.y = s * 0.5; port.position.set(s * 0.15, 1.13, 0.14);
    const hip = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.011, 0.01), cord));
    hip.rotation.z = -s * 0.45; hip.position.set(s * 0.1, 0.99, 0.158);
  }

  // hose from the left waist port down the leg, plus a small end connector
  const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.15, 1.12, 0.16), new THREE.Vector3(-0.24, 0.92, 0.17), new THREE.Vector3(-0.245, 0.55, 0.14), new THREE.Vector3(-0.225, 0.2, 0.13)]);
  add(new THREE.Mesh(new THREE.TubeGeometry(hose, 40, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x5b5a78, roughness: 0.6 })));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.03), new THREE.MeshStandardMaterial({ color: 0xaeb0b6, roughness: 0.4, metalness: 0.6 }))).position.set(-0.225, 0.17, 0.13);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.8 }))).position.set(-0.222, 0.115, 0.13);

  // Spain flag patch texture (simplified, no coat of arms)
  const fc = document.createElement("canvas");
  fc.width = 192; fc.height = 128;
  const f = fc.getContext("2d")!;
  f.fillStyle = "#aa151b"; f.fillRect(0, 0, 192, 128);
  f.fillStyle = "#f1bf00"; f.fillRect(0, 32, 192, 64);
  const flagTex = new THREE.CanvasTexture(fc);
  flagTex.colorSpace = THREE.SRGBColorSpace;

  // arms: segments run down -y from the shoulder
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.26, 1.47, 0);
    arm.rotation.z = s * 0.1;
    g.add(arm);
    cyl(0.082, 0.078, 0.3, 0, cream, arm);
    cyl(0.08, 0.075, 0.27, -0.3, tan, arm);
    for (let i = 0; i < 9; i++) ring(0.079 - i * 0.0005, 0.0065, -0.315 - i * 0.03, cord, arm);
    cyl(0.07, 0.062, 0.2, -0.57, cream, arm);
    ring(0.064, 0.013, -0.775, metal, arm);
    ring(0.066, 0.009, -0.8, metal, arm);
    const glove = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.09, 6, 14), white), arm);
    glove.position.y = -0.87; glove.scale.set(1, 1, 0.75);
    for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5f6b55, roughness: 0.8 })), arm).position.set((i - 1) * 0.026, -0.965, 0.012);
    if (s === 1) {
      const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.07), new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.85 })), arm);
      flag.position.set(0.0, -0.13, 0.083); flag.rotation.y = 0.0;
      const gauge = add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.018, 24), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3, metalness: 0.4 })), arm);
      gauge.rotation.x = Math.PI / 2; gauge.position.set(0, -0.68, 0.075);
    } else {
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.075), new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.9 })), arm).position.set(0, -0.14, 0.083);
    }
  }

  // neck ring, soft cap, red band, bubble visor
  cyl(0.11, 0.12, 0.06, 1.6, cream, g);
  ring(0.125, 0.02, 1.62, metal, g);
  const headY = 1.77;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 1 }))).position.set(0, headY - 0.02, -0.01);
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.42), white));
  cap.scale.set(1, 1.08, 1.05); cap.position.y = headY;
  const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.17 * Math.sin(Math.PI * 0.42), 0.012, 10, 48), new THREE.MeshStandardMaterial({ color: 0xb53a2b, roughness: 0.6 })));
  band.rotation.x = Math.PI / 2; band.scale.set(1.0, 1.05, 1); band.position.y = headY + 0.17 * 1.08 * Math.cos(Math.PI * 0.42);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 28), glass);
  bubble.scale.set(1, 1.08, 1.05); bubble.position.y = headY; bubble.renderOrder = 2;
  g.add(bubble);
  ring(0.165, 0.012, headY - 0.14, metal, g, 1, 1.05);

  // blue shoulder cords
  for (const s of [-1, 1]) { const c = ring(0.09, 0.006, 1.5, cord, g); c.position.x = s * 0.255; c.rotation.z = s * 0.2; }
  return g;
}

async function buildSuit({ scene, renderer, progress }: Ctx): Promise<Built> {
  scene.background = new THREE.Color(0x06080e);
  scene.fog = new THREE.Fog(0x06080e, 14, 34);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pm.dispose();

  const key = new THREE.SpotLight(0xfff1dc, 110, 30, 0.42, 0.5, 1.6);
  key.position.set(5, 8, 6);
  key.target.position.set(0, 1.6, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  const rim = new THREE.SpotLight(0x6fa8ff, 60, 30, 0.5, 0.6, 1.6);
  rim.position.set(-6, 5, -5);
  rim.target.position.set(0, 1.6, 0);
  scene.add(key, key.target, rim, rim.target);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.38, metalness: 0.6 }));
  floor.receiveShadow = true;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.18, 96), new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.25, metalness: 0.85 }));
  ped.position.y = 0.09;
  ped.receiveShadow = ped.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.012, 12, 128).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x58a6ff).multiplyScalar(4), toneMapped: false }));
  ring.position.y = 0.18;
  scene.add(floor, ped, ring);

  let suit: THREE.Object3D;
  try {
    suit = (await loadModel("/models/emu.glb", progress)).scene;
    const box = fitModel(suit, 3.1, "y");
    suit.position.y += 0.18 - box.min.y;
    shade(suit, 1.0);
    // The export marks almost every material fully transmissive (glass); only the visor layers are partial.
    suit.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mt = m.material as THREE.MeshPhysicalMaterial;
      if (mt.transmission >= 0.99) { mt.transmission = 0; mt.transparent = false; mt.opacity = 1; }
      else if (mt.transmission > 0) m.visible = false;
      // flat duplicate/helper layers baked into this export (large opaque plates through the torso)
      if (/_(4|5|6|7|9|13)$/.test(m.name)) m.visible = false;
    });
    const wrap = new THREE.Group();
    wrap.add(suit);
    wrap.rotation.y = Math.PI; // the model faces away from the default camera
    suit = wrap;
  } catch (e) {
    console.error("EMU model failed, using procedural suit", e);
    suit = makeSokolSuit();
    suit.scale.setScalar(1.6);
    suit.position.y = 0.18;
  }
  scene.add(suit);

  return {
    update: () => {},
    cam: { pos: [2.4, 2.1, 4.1], target: [0, 1.65, 0], min: 2, max: 10, maxPolar: Math.PI / 2 - 0.02, autoRotate: 0.7 },
    bloom: [0.3, 0.5, 1.1], exposure: 0.9, shadows: true,
    fire: { pos: [1.05, 0.18 + 0.26, 0.75], scale: 0.85, mount: "pan", light: 0.16, bloom: 0.22, cam: { pos: [3.3, 1.45, 3.7], target: [1.05, 0.95, 0.75] } },
  };
}

// A fire-safety test pad on Earth: 1 g, daylight, sky and horizon.
async function buildEarthSite({ scene }: Ctx): Promise<Built> {
  const horizon = new THREE.Color(0xd6e6f2), zenith = new THREE.Color(0x3f7fcf);
  scene.background = horizon.clone();
  scene.fog = new THREE.FogExp2(0xc7dbec, 0.0042);
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { h: { value: horizon }, z: { value: zenith } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 h; uniform vec3 z; varying vec3 vP; void main(){ float t = pow(clamp(vP.y,0.0,1.0), 0.5); gl_FragColor = vec4(mix(h, z, t), 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  ));
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.42).normalize();
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.0);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x4d4333, 0.85));
  scene.add(sunDisc(sunDir, 800, 12, 0xfff3dc));

  const { group: terr } = makeTerrain({ size: 300, seg: 300, amp: 2.4, freq: 0.02, craters: 0, craterMax: 1, seed: 33, flat: 8, low: new THREE.Color(0x6a5a3f), high: new THREE.Color(0xb09a6c), roughness: 0.96 });
  terr.name = "earth_ground";
  scene.add(terr);
  const ridgeE = makeRidge(170, 15, 0x6d7d86, 4, 2.0);
  ridgeE.name = "earth_ridge";
  scene.add(ridgeE);

  // concrete test pad, a red extinguisher and safety cones
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.4, 0.14, 72), new THREE.MeshStandardMaterial({ color: 0x8d9096, roughness: 0.92 }));
  pad.name = "earth_pad";
  pad.position.y = 0.0;
  pad.receiveShadow = pad.castShadow = true;
  scene.add(pad);
  const ex = new THREE.Group();
  const eb = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 24), new THREE.MeshStandardMaterial({ color: 0xc21f1f, roughness: 0.35, metalness: 0.3 }));
  eb.name = "earth_extinguisher";
  eb.position.y = 0.4;
  const ec = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.14, 14), new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.4, metalness: 0.6 }));
  ec.name = "earth_extinguisher";
  ec.position.y = 0.87;
  ex.add(eb, ec);
  ex.position.set(-3.0, 0.07, 2.1);
  ex.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  scene.add(ex);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 }));
    cone.name = `earth_cone_${i}`;
    cone.position.set(Math.cos(a) * 4.6, 0.25, Math.sin(a) * 4.6);
    cone.castShadow = true;
    scene.add(cone);
  }
  return {
    update: () => {},
    cam: { pos: [6.4, 2.5, 8.2], target: [0, 1.0, 0], min: 1.4, max: 45, maxPolar: Math.PI / 2 - 0.03 },
    bloom: [0.3, 0.6, 0.9], exposure: 1.0, shadows: true,
    fire: { pos: [0, 0.07 + 0.36, 0], scale: 1.2, mount: "pan", cam: { pos: [3.0, 1.5, 3.5], target: [0, 0.95, 0] } },
  };
}

// Inside a pressurised module of the ISS: racks, handrails, light strips and the open end looking at Earth. 0 g.
async function buildIssInterior({ scene }: Ctx): Promise<Built> {
  scene.background = new THREE.Color(0x000003);
  scene.add(stars(5000, 900));
  const R = 2.5, L = 20;
  const earth = await makeEarth(46, 0.6);
  earth.group.position.set(0, -40, -82);
  earth.group.rotation.set(0.25, 1.1, 0);
  scene.add(earth.group);
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.35);
  sun.position.set(14, 22, -40);
  scene.add(sun);

  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, L, 72, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }),
  );
  hull.name = "isscab_hull";
  scene.add(hull);
  // racks around the module
  const rackA = new THREE.MeshStandardMaterial({ color: 0xb4b9bf, roughness: 0.55, metalness: 0.2 });
  const rackB = new THREE.MeshStandardMaterial({ color: 0x8b929c, roughness: 0.5, metalness: 0.3 });
  const doorLine = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6 });
  const screenMats = [0x2fb36a, 0x4aa3ff, 0xffb347].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(0.8) }));
  const NR = 8;
  for (let i = 0; i < NR; i++) {
    const a = (i / NR) * Math.PI * 2 + Math.PI / NR;
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, L - 1.6), i % 2 ? rackA : rackB);
    slab.name = `isscab_rack_${i}`;
    g.add(slab);
    for (let k = -3; k <= 3; k++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.02), doorLine);
      door.name = `isscab_rack_${i}_door`;
      door.position.set(0, -0.36, k * 2.4);
      g.add(door);
      if ((k + i) % 3 === 0) {
        const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28), screenMats[(k + i + 9) % 3]);
        sc.name = `isscab_rack_${i}_screen`;
        sc.rotation.x = Math.PI / 2;
        sc.position.set(0.3, -0.361, k * 2.4 + 0.9);
        g.add(sc);
      }
    }
    g.position.set(Math.sin(a) * (R - 0.35), Math.cos(a) * (R - 0.35), 0);
    g.rotation.z = -a;
    scene.add(g);
  }
  // ceiling light strips and handrails
  const strip = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf4f8ff).multiplyScalar(0.8) });
  const rail = new THREE.MeshStandardMaterial({ color: 0xd9b52c, roughness: 0.35, metalness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, L - 2), strip);
    st.name = "isscab_strip";
    st.position.set(Math.sin(a) * (R - 0.74), Math.cos(a) * (R - 0.74), 0);
    st.rotation.z = -a;
    scene.add(st);
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, L - 3, 10).rotateX(Math.PI / 2), rail);
    const b = a + Math.PI / 4;
    hr.name = "isscab_handrail";
    hr.position.set(Math.sin(b) * (R - 0.8), Math.cos(b) * (R - 0.8), 0);
    scene.add(hr);
  }
  // end ring that frames the open view of Earth and the closed bulkhead behind the camera
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.1, 16, 96), new THREE.MeshStandardMaterial({ color: 0xaab1bb, roughness: 0.3, metalness: 0.8 }));
  ring.name = "isscab_endring";
  ring.position.z = -L / 2;
  scene.add(ring);
  const bulk = new THREE.Mesh(new THREE.CircleGeometry(R, 72), new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.5, metalness: 0.4 }));
  bulk.name = "isscab_bulkhead";
  bulk.position.z = L / 2;
  bulk.rotation.y = Math.PI;
  scene.add(bulk);
  // probe that holds the burner, coming in from the left wall
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.32, metalness: 0.92 });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 16).rotateZ(Math.PI / 2), steel);
  arm.name = "isscab_probe";
  arm.position.set(-1.78, 0, 0);
  scene.add(arm);
  // interior lighting
  scene.add(new THREE.HemisphereLight(0xdbe6f5, 0x59606b, 0.16));
  for (const z of [-4, 3]) {
    const pl = new THREE.PointLight(0xeef4ff, 3.2, 14, 2);
    pl.position.set(0, 1.5, z);
    scene.add(pl);
  }
  return {
    update: (dt) => { earth.earth.rotation.y += dt * 0.01; earth.clouds.rotation.y += dt * 0.014; },
    cam: { pos: [2.0, 0.55, 5.4], target: [0, -0.05, -0.6], min: 0.9, max: 8.5 },
    bloom: [0.4, 0.5, 1.2], exposure: 0.85,
    fire: { pos: [0, -0.78, 0], scale: 1.0, mount: "droplet", light: 0.5, bloom: 0.4, cam: { pos: [1.4, 0.25, 2.4], target: [0, 0, 0] } },
  };
}

const FIRE_BUILDERS: Record<ImmersiveEnv, (c: Ctx) => Promise<Built>> = { earth: buildEarthSite, moon: buildMoon, mars: buildMars, iss: buildIssInterior, suit: buildSuit };

const BUILDERS: Record<ImmersiveEnv, (c: Ctx) => Promise<Built>> = { earth: buildEarth, moon: buildMoon, mars: buildMars, iss: buildIss, suit: buildSuit };

// ---------- component ----------
export default function ImmersiveScene({ env, fire, className = "h-[68vh] min-h-[460px]", onPick, life, wide, overview, onReady }: { env: ImmersiveEnv; fire?: FireParams; className?: string; onPick?: (point: [number, number, number], info?: PickInfo) => void; /** Fire Lab: load the playable site, keep the wide view and the tap-to-pick, but build no single flame */ wide?: boolean; /** Fire Lab: show the whole place (full ISS, whole Earth) instead of the playable site; orientation only, no ignition */ overview?: boolean; /** Fire Lab: receives the live scene; return a cleanup */ onReady?: (api: SceneApi) => void | (() => void); /** 0..1 flame vitality driven from outside; null/undefined keeps the built-in cycle */ life?: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const fireOn = !!fire || !!wide;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const fireKey = fire ? JSON.stringify(fire) : "";
  const fireRef = useRef<FireParams | undefined>(fire);
  fireRef.current = fire;
  const hfRef = useRef<HyperFire | null>(null);
  const actions = useRef<{ focus: () => void; overview: () => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const { lang } = useLang();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setState("loading");
    setProgress(0);
    let disposed = false;
    let raf = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    const maxDpr = Math.min(window.devicePixelRatio, smallScreen() ? 1.5 : 2);
    let dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    const composer = new EffectComposer(renderer);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.6, 0.9);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let built: Built | null = null;
    let hf: HyperFire | null = null;
    const ignore: THREE.Object3D[] = [];
    const updaters: ((dt: number, t: number, camera: THREE.PerspectiveCamera, pxPerUnit: number) => void)[] = [];
    let labCleanup: void | (() => void);
    const skip = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (ignore.includes(p)) return true; return false; };
    const hitAt = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      // three.js raycasts hidden meshes too: a tap must only land on what the user can see
      const shown = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as THREE.Mesh).isMesh && shown(h.object) && !inFire(h.object) && !skip(h.object));
      if (!hit) return null;
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      if (n.dot(ray.ray.direction) > 0) n.negate();
      const mats = (hit.object as THREE.Mesh).material;
      const hitMat = Array.isArray(mats) ? mats[hit.face?.materialIndex ?? 0] : mats;
      return { point: hit.point, normal: n, name: hit.object.name || (hit.object.parent?.name ?? ""), material: hitMat?.name ?? "" };
    };
    // touch to burn: a short tap (not a drag) moves the fire to the surface under the finger and reports the point
    let down: { x: number; y: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
    const inFire = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (hf && p === hf.group) return true; return false; };
    const onUp = (e: PointerEvent) => {
      const d = down; down = null;
      const cb = pickRef.current;
      if (!d || !cb || !(built?.fire || wide) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 500) return;
      const hit = hitAt(e.clientX, e.clientY);
      if (!hit) return;
      hf?.group.position.copy(hit.point);
      built?.pin?.();
      cb([hit.point.x, hit.point.y, hit.point.z], { normal: [hit.normal.x, hit.normal.y, hit.normal.z], name: hit.name, material: hit.material });
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    let tween: { t0: number; dur: number; p0: THREE.Vector3; p1: THREE.Vector3; q0: THREE.Vector3; q1: THREE.Vector3 } | null = null;
    let home: { p: THREE.Vector3; q: THREE.Vector3 } | null = null;
    const flyTo = (p: THREE.Vector3, q: THREE.Vector3) => {
      tween = { t0: performance.now(), dur: 1300, p0: camera.position.clone(), p1: p.clone(), q0: controls.target.clone(), q1: q.clone() };
    };
    let last = performance.now(), elapsed = 0;
    // do not burn the GPU while the scene is scrolled out of view or the tab is hidden
    let visible = true;
    let warm = 0, slow = 0, frames = 0;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.02 });
    io.observe(el);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (!visible || document.hidden) { last = now; return; }
      const rawMs = now - last;
      const dt = Math.min(rawMs / 1000, 0.05);
      last = now;
      if (!built) return;
      // adaptive resolution safety net: a device that sustains < ~36 fps drops the render resolution step by step
      // (never below 1x, never back up in this session). Capable GPUs never trigger it, so their quality is untouched.
      if (warm++ > 60 && dpr > 1) {
        slow += rawMs; frames++;
        if (frames === 60) {
          const avg = slow / frames;
          if (avg > 28) { dpr = Math.max(1, dpr - (avg > 60 ? 0.5 : 0.25)); renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); resize(); warm = 0; }
          slow = 0; frames = 0;
        }
      }
      elapsed += dt;
      built.update(dt, elapsed);
      if (tween) {
        const k = Math.min(1, (performance.now() - tween.t0) / tween.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camera.position.lerpVectors(tween.p0, tween.p1, e);
        controls.target.lerpVectors(tween.q0, tween.q1, e);
        if (k >= 1) tween = null;
      }
      const pxPerUnit = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      if (hf) hf.update(dt, elapsed, camera, pxPerUnit);
      for (const u of updaters) u(dt, elapsed, camera, pxPerUnit);
      controls.update();
      composer.render();
    };

    (fireOn && !overview ? FIRE_BUILDERS : BUILDERS)[env]({ scene, renderer, progress: (f) => { if (!disposed) setProgress(Math.min(0.99, Math.max(0, f))); } })
      .then((b) => {
        if (disposed) return;
        built = b;
        renderer.toneMappingExposure = b.exposure;
        renderer.shadowMap.enabled = !!b.shadows;
        bloom.strength = fireOn && b.fire ? (b.fire.bloom ?? Math.max(b.bloom[0], 0.55)) : b.bloom[0]; bloom.radius = b.bloom[1]; bloom.threshold = b.bloom[2];
        if (fireOn && b.fire && !wide) {
          hf = createHyperFire({ scale: b.fire.scale, mount: b.fire.mount, light: b.fire.light });
          hf.group.position.set(...b.fire.pos);
          if (fireRef.current) hf.set(fireRef.current);
          scene.add(hf.group);
          hfRef.current = hf;
        }
        // portrait screens: pull the camera back so the subject still fits
        const k = camera.aspect < 1 ? Math.min(2, 1 / Math.pow(camera.aspect, 0.85)) : 1;
        const t = new THREE.Vector3(...b.cam.target);
        camera.position.copy(t).add(new THREE.Vector3(...b.cam.pos).sub(t).multiplyScalar(k));
        controls.target.copy(t);
        controls.minDistance = fireOn && b.fire ? Math.min(b.cam.min, 1.2) : b.cam.min;
        controls.maxDistance = b.cam.max * k;
        controls.maxPolarAngle = b.cam.maxPolar ?? Math.PI;
        controls.autoRotate = !!b.cam.autoRotate;
        controls.autoRotateSpeed = b.cam.autoRotate ?? 0;
        controls.update();
        home = { p: camera.position.clone(), q: controls.target.clone() };
        const fc = b.fire?.cam;
        actions.current = {
          focus: () => { if (fc) flyTo(new THREE.Vector3(...fc.pos), new THREE.Vector3(...fc.target)); },
          overview: () => { if (home) flyTo(home.p, home.q); },
        };
        setState("ready");
        if (onReadyRef.current) {
          labCleanup = onReadyRef.current({ scene, camera, controls, ignore, addUpdater: (fn) => { updaters.push(fn); }, raycast: hitAt });
        }
      })
      .catch((e) => { console.error(e); if (!disposed) setState("error"); });
    loop();

    return () => {
      disposed = true;
      if (typeof labCleanup === "function") labCleanup();
      hfRef.current = null;
      actions.current = null;
      cancelAnimationFrame(raf);
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      });
      (scene.environment as THREE.Texture | null)?.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // give the GPU context back now; dispose() alone leaves it alive until GC
      renderer.domElement.remove();
    };
  }, [env, fireOn, wide, overview]);

  useEffect(() => {
    if (fireRef.current) hfRef.current?.set(fireRef.current);
  }, [fireKey]);

  useEffect(() => {
    hfRef.current?.setLife(life ?? null);
  }, [life, state]);

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-black ${className}`}>
      <div ref={host} className="absolute inset-0" />
      {state === "loading" && (
        <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="w-64 max-w-[80%] text-center">
            <p className="mb-2 text-sm text-white/80">
              {lang === "es" ? "Cargando modelo" : "Loading model"}
              {progress > 0 ? ` · ${Math.round(progress * 100)}%` : "…"}
              {env === "iss" ? " (~15 MB)" : ""}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={`h-full rounded-full bg-sky-400 ${progress > 0 ? "transition-[width] duration-200" : "w-2/5 animate-pulse"}`}
                style={progress > 0 ? { width: `${progress * 100}%` } : undefined}
              />
            </div>
          </div>
        </div>
      )}
      {state === "error" && <div className="absolute inset-0 grid place-items-center text-sm text-red-300">{lang === "es" ? "No se pudo iniciar la escena 3D (¿WebGL no disponible?)." : "Could not start the 3D scene (WebGL unavailable?)."}</div>}
      <div className="pointer-events-none absolute bottom-3 left-3 text-xs text-white/50">{lang === "es" ? "Arrastra para orbitar · rueda para acercar" : "Drag to orbit · scroll to zoom"}</div>
      {fireOn && !wide && state === "ready" && (
        <div className="absolute right-3 top-3 flex flex-wrap gap-2 text-xs">
          <button onClick={() => actions.current?.focus()} className="rounded-full bg-black/55 px-3 py-1.5 text-white/90 backdrop-blur hover:bg-black/75">{lang === "es" ? "Ir al fuego" : "Go to the fire"}</button>
          <button onClick={() => actions.current?.overview()} className="rounded-full bg-black/55 px-3 py-1.5 text-white/90 backdrop-blur hover:bg-black/75">{lang === "es" ? "Vista general" : "Overview"}</button>
          <button onClick={() => hfRef.current?.reignite()} className="rounded-full bg-black/55 px-3 py-1.5 text-white/90 backdrop-blur hover:bg-black/75">{lang === "es" ? "Reencender" : "Reignite"}</button>
        </div>
      )}
    </div>
  );
}
