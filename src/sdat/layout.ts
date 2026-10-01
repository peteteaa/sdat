import { Euler, Matrix4, Quaternion, Vector3 } from 'three';

export const CASSETTE = { w: 2.2, h: 1.6, t: 0.3 };
/** Printed face of the cassette, same aspect as its canvas (512x372). */
export const FACE = { w: 2.1, h: 2.1 * (372 / 512) };

export const PLAYER_POS = new Vector3(2.05, 0.3, 0.15);
export const PLAYER_YAW = -0.32;
/** Cassette centre inside the bay, in player space. */
export const SLOT = new Vector3(-0.5, 0.18, 0);
export const HOVER = 1.5;

/** Turntable changer: cassettes stand on edge in radial slots, spine up. */
export const CAROUSEL_POS = new Vector3(-3.4, 0, 0.5);
export const PLATTER_TOP = 0.22;
export const PLATTER_R = 3.15;
export const HUB_R = 0.78;
/** Distance from the centre to the middle of a cassette. */
export const SLOT_R = HUB_R + 0.1 + CASSETTE.w / 2;
/** Platter angle (from +z towards +x) of the selected slot: faces the camera. */
export const FRONT = 0.35;
/** Selected cassette rises this far out of its slot. */
export const POP = 0.5;

/** Slots on the platter; empty ones stay visible like the real changer. */
export const slotCount = (tracks: number) => Math.max(16, tracks);
export const slotStep = (tracks: number) => (Math.PI * 2) / slotCount(tracks);

const ONE = new Vector3(1, 1, 1);
const PLAYER_Q = new Quaternion().setFromEuler(new Euler(0, PLAYER_YAW, 0));
const PLAYER_MAT = new Matrix4().compose(PLAYER_POS, PLAYER_Q, ONE);
const e = new Euler();

/**
 * World pose of cassette `i` standing in its carousel slot. Positive angles
 * sit to the right of the front, so raising `scroll` slides tapes leftwards.
 */
export function carouselPose(i: number, scroll: number, tracks: number, pos: Vector3, quat: Quaternion) {
  const offset = i - scroll;
  const phi = FRONT + offset * slotStep(tracks);
  const focus = Math.max(0, 1 - Math.abs(offset));
  const r = SLOT_R + 0.18 * focus;
  pos.set(Math.sin(phi) * r, PLATTER_TOP + CASSETTE.h / 2 + POP * focus, Math.cos(phi) * r).add(CAROUSEL_POS);
  // Local +X (the long edge) points outwards; +Y (the spine) faces up.
  quat.setFromEuler(e.set(0, phi - Math.PI / 2, 0));
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
