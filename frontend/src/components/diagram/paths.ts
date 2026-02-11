import * as THREE from "three";

export const readyToCpu = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(2.95, 0.47, 1.82),
    new THREE.Vector3(2.46, 0.47, 1.82),
    new THREE.Vector3(1.78, 0.46, 1.72),
    new THREE.Vector3(1.04, 0.5, 1.58),
    new THREE.Vector3(0.36, 0.58, 1.42),
    new THREE.Vector3(0.04, 0.64, 1.28),
  ],
  false,
  "catmullrom",
  0.42,
);

export const cpuToIo = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.06, 0.62, 1.26),
    new THREE.Vector3(0.65, 0.56, 1.12),
    new THREE.Vector3(1.42, 0.5, 0.7),
    new THREE.Vector3(2.18, 0.46, 0.12),
    new THREE.Vector3(3.14, 0.44, -0.2),
    new THREE.Vector3(3.78, 0.42, -0.28),
  ],
  false,
  "catmullrom",
  0.42,
);

export const ioToQueueReturn = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(3.78, 0.42, -0.28),
    new THREE.Vector3(2.86, 0.4, 0.06),
    new THREE.Vector3(1.82, 0.4, 0.8),
    new THREE.Vector3(1.2, 0.44, 1.42),
    new THREE.Vector3(1.58, 0.48, 1.84),
    new THREE.Vector3(2.2, 0.47, 1.82),
  ],
  false,
  "catmullrom",
  0.42,
);

export const cpuToQueueReturn = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.04, 0.64, 1.28),
    new THREE.Vector3(0.62, 0.54, 1.36),
    new THREE.Vector3(1.24, 0.48, 1.66),
    new THREE.Vector3(1.92, 0.46, 1.82),
    new THREE.Vector3(2.22, 0.47, 1.82),
  ],
  false,
  "catmullrom",
  0.42,
);

export const cpuToDone = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.04, 0.64, 1.28),
    new THREE.Vector3(0.6, 0.76, 1.42),
    new THREE.Vector3(1.44, 0.88, 1.08),
    new THREE.Vector3(2.42, 0.98, 0.44),
    new THREE.Vector3(3.46, 1.04, -0.06),
    new THREE.Vector3(4.38, 1.06, -0.18),
  ],
  false,
  "catmullrom",
  0.4,
);

export const memoryBusCurve = new THREE.CatmullRomCurve3(
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

export const ioBusCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.3, 0.58, 0.02),
    new THREE.Vector3(1.0, 0.46, -0.08),
    new THREE.Vector3(1.92, 0.42, -0.18),
    new THREE.Vector3(2.86, 0.42, -0.28),
    new THREE.Vector3(3.72, 0.42, -0.34),
  ],
  false,
  "catmullrom",
  0.4,
);

export const readyLaneCurve = readyToCpu;
export const returnLaneCurve = ioToQueueReturn;

// Backward compatibility exports for existing imports.
export const readyCurve = readyToCpu;
export const memCurve = memoryBusCurve;
export const ioCurve = ioBusCurve;
