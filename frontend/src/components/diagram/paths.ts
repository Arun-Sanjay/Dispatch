import * as THREE from "three";

export const readyCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(3.1, 0.34, 1.9),
    new THREE.Vector3(2.45, 0.34, 1.9),
    new THREE.Vector3(1.65, 0.34, 1.72),
    new THREE.Vector3(0.88, 0.38, 1.48),
    new THREE.Vector3(0.24, 0.5, 1.3),
    new THREE.Vector3(0.02, 0.62, 1.22),
  ],
  false,
  "catmullrom",
  0.45,
);

export const memCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-0.32, 0.6, 0.18),
    new THREE.Vector3(-0.9, 0.46, 0.12),
    new THREE.Vector3(-1.9, 0.36, 0.08),
    new THREE.Vector3(-2.8, 0.34, 0.02),
    new THREE.Vector3(-3.55, 0.34, -0.08),
  ],
  false,
  "catmullrom",
  0.4,
);

export const ioCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.34, 0.6, -0.08),
    new THREE.Vector3(0.95, 0.44, -0.12),
    new THREE.Vector3(1.9, 0.34, -0.18),
    new THREE.Vector3(2.85, 0.34, -0.24),
    new THREE.Vector3(3.65, 0.34, -0.34),
  ],
  false,
  "catmullrom",
  0.4,
);
