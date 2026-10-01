import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

export const CASSETTE = { w: 2.2, h: 1.6, t: 0.3 };
/** Printed face of the cassette, same aspect as its canvas (512x372). */
export const FACE = { w: 2.1, h: 2.1 * (372 / 512) };

export const PLAYER_POS = new Vector3(1.9, 0.45, -0.3);
export const PLAYER_YAW = -0.32;
/** Cassette centre inside the bay, in player space. */
export const SLOT = new Vector3(1.2, 0.36, -0.05);
export const HOVER = 1.5;

export const WHEEL_POS = new Vector3(-3.05, 1.95, 0.9);
export const WHEEL_YAW = 0.22;
export const WHEEL_TILT = -0.5;
export const WHEEL_R = 2.05;
export const WHEEL_STEP = 2 * Math.asin((CASSETTE.h / 2 + 0.1) / WHEEL_R);

const ONE = new Vector3(1, 1, 1);
const PLAYER_Q = new Quaternion().setFromEuler(new Euler(0, PLAYER_YAW, 0));
const PLAYER_MAT = new Matrix4().compose(PLAYER_POS, PLAYER_Q, ONE);
const WHEEL_Q = new Quaternion().setFromEuler(new Euler(WHEEL_TILT, WHEEL_YAW, 0, 'YXZ'));
const WHEEL_MAT = new Matrix4().compose(WHEEL_POS, WHEEL_Q, ONE);
const e = new Euler();

/** World pose of cassette `i` on the wheel. Returns its angle from the front. */
export function wheelPose(i: number, scroll: number, pos: Vector3, quat: Quaternion) {
  const th = (i - scroll) * WHEEL_STEP;
  pos.set(0, WHEEL_R * Math.sin(th), WHEEL_R * Math.cos(th)).applyMatrix4(WHEEL_MAT);
  quat.setFromEuler(e.set(-th, 0, 0)).premultiply(WHEEL_Q);
  return th;
}

/** World pose of a cassette lying in the player bay, `lift` units above it. */
export function slotPose(lift: number, pos: Vector3, quat: Quaternion) {
  pos.copy(SLOT);
  pos.y += lift;
  pos.applyMatrix4(PLAYER_MAT);
  quat.setFromEuler(e.set(-Math.PI / 2, 0, 0)).premultiply(PLAYER_Q);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
