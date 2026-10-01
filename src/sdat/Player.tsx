import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import {
  CatmullRomCurve3, ExtrudeGeometry, Shape, Vector3,
  type Group, type MeshStandardMaterial,
} from 'three';
import type { ButtonName, Deck } from './deck';
import { PLAYER_POS, PLAYER_YAW, SLOT, damp } from './layout';
import { FRONT_PRINT, LCD_SIZE, LID, canvasTexture, drawLCD, frontPrint, iconTexture, lidPrint } from './textures';

export const BODY = '#2b2456';
const LID_COLOR = '#2f2a52';
const CAP = '#14121d';
const TRIM = '#a9a3c9';

/*
 * Player space, after the anime prop / WMD-DT1 replica: a big hinged lid over
 * the tape bay (x < END_X) and a black end section holding a narrow LCD.
 * Transport keys sit along the front edge (z = +D/2).
 */
// Sized around the 2.2 x 1.6 x 0.3 cassette: the bay is barely larger than the tape.
const W = 3.4;
const D = 1.9;
/** Left edge of the end section; the lid stops just short of it. */
const END_X = 0.72;
const LID_X = SLOT.x;
const BOTTOM = -0.3;
/** Bay floor / top of the lower shell. */
const FLOOR = 0.02;
const LID_HINGE_Y = 0.4;
const TOP = 0.46;
const FRONT_Z = D / 2;
/** Keys sit on the front wall of the bay, labels on the shell below the trim. */
const KEY_Y = 0.19;
const LABEL_Y = -0.14;

function roundedRect(shape: Shape, x: number, y: number, w: number, h: number, r: number) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

interface Rect { x: number; z: number; w: number; d: number; r: number }

/**
 * A flat rounded slab (optionally with a rounded hole), lying in XZ with its
 * top at y = 0. Rects are given in XZ, centred on (x, z).
 */
function slab(outer: Rect, depth: number, hole?: Rect, bevel = 0.02) {
  const s = roundedRect(new Shape(), outer.x - outer.w / 2, -outer.z - outer.d / 2, outer.w, outer.d, outer.r);
  if (hole) s.holes.push(roundedRect(new Shape(), hole.x - hole.w / 2, -hole.z - hole.d / 2, hole.w, hole.d, hole.r));
  const g = new ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth - bevel, 0);
  return g;
}

/** LCD panel lying flat; `width` runs along its local x. */
function LCD({ deck, width }: { deck: Deck; width: number }) {
  const tex = useMemo(() => canvasTexture(LCD_SIZE.w, LCD_SIZE.h, () => {}), []);
  const mat = useRef<MeshStandardMaterial>(null);
  const levels = useRef<[number, number]>([0, 0]);
  const acc = useRef(1);

  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 1 / 30) return;
    const step = acc.current;
    acc.current = 0;
    const [l, r] = deck.engine.meter();
    const lv = levels.current;
    lv[0] = Math.max(l, lv[0] - step * 1.8);
    lv[1] = Math.max(r, lv[1] - step * 1.8);
    const index = deck.anim?.kind === 'load' ? deck.anim.index : deck.loaded;
    const track = index === null ? null : deck.tracks[index];
    drawLCD((tex.image as HTMLCanvasElement).getContext('2d')!, {
      status: deck.status,
      pgm: track?.pgm ?? null,
      title: track?.title ?? '',
      seconds: deck.status === 'stopped' ? 0 : deck.engine.time,
      levels: lv,
      clock: deck.clock,
    });
    tex.needsUpdate = true;
    if (mat.current) {
      const on = deck.status === 'playing' || deck.status === 'reading' ? 0.32 : 0.12;
      mat.current.emissiveIntensity = damp(mat.current.emissiveIntensity, on, 6, step);
    }
  });

  return (
    <mesh rotation-x={-Math.PI / 2}>
      <planeGeometry args={[width, width * (LCD_SIZE.h / LCD_SIZE.w)]} />
      <meshStandardMaterial ref={mat} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.12} roughness={0.55} />
    </mesh>
  );
}

interface ButtonProps {
  name: ButtonName;
  deck: Deck;
  position: [number, number, number];
  /** Orientation of the button's outward axis (local +y). */
  rotation?: [number, number, number];
  round?: boolean;
  size?: [number, number];
}

/** A key that pushes in along its outward axis. */
function Button({ name, deck, position, rotation, round = false, size = [0.34, 0.2] }: ButtonProps) {
  const cap = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const icon = useMemo(() => iconTexture(name), [name]);
  const [w, h] = size;
  const recess = useMemo(() => {
    const r = round ? w / 2 : 0.05;
    return slab(
      { x: 0, z: 0, w: w + 0.07, d: h + 0.07, r: round ? r + 0.035 : r },
      0.01,
      { x: 0, z: 0, w: w + 0.02, d: h + 0.02, r: round ? r + 0.01 : 0.04 },
      0.005,
    );
  }, [w, h, round]);

  useFrame((_, dt) => {
    const since = deck.clock - (deck.presses[name] ?? -10);
    const target = 0.025 - (since < 0.14 ? 0.035 : 0) + (hover ? 0.008 : 0);
    if (cap.current) cap.current.position.y = damp(cap.current.position.y, target, 30, dt);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    deck.press(name);
  };
  const color = hover ? '#3d3574' : '#1b1730';
  const iconSize = Math.min(w, h) * 0.8;

  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={recess} position-y={0.006}>
        <meshStandardMaterial color="#09080f" roughness={0.6} />
      </mesh>
      <group
        ref={cap}
        onPointerDown={onDown}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        {round ? (
          <mesh castShadow>
            <cylinderGeometry args={[w / 2, w / 2, 0.08, 40]} />
            <meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} />
          </mesh>
        ) : (
          <RoundedBox args={[w, 0.08, h]} radius={0.03} smoothness={3} castShadow>
            <meshPhysicalMaterial color={color} roughness={0.4} clearcoat={0.5} />
          </RoundedBox>
        )}
        <mesh position-y={0.041} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[iconSize, iconSize]} />
          <meshBasicMaterial map={icon} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Lid({ deck }: { deck: Deck }) {
  const hinge = useRef<Group>(null);
  const print = useMemo(() => lidPrint(), []);
  const win = LID.window;
  const geo = useMemo(
    () => slab(
      { x: 0, z: LID.d / 2, w: LID.w - 0.04, d: LID.d - 0.04, r: 0.1 },
      0.08,
      { x: 0, z: win.z, w: win.w, d: win.d, r: win.d / 2 - 0.01 },
    ),
    [win],
  );

  useFrame(() => {
    if (hinge.current) hinge.current.rotation.x = -deck.lid * 1.85;
  });

  return (
    <group ref={hinge} position={[LID_X, LID_HINGE_Y, -D / 2]}>
      <mesh geometry={geo} position-y={0.06} castShadow receiveShadow>
        <meshPhysicalMaterial color={LID_COLOR} metalness={0.55} roughness={0.32} clearcoat={0.6} clearcoatRoughness={0.25} />
      </mesh>
      {/* Smoked window glass. */}
      <mesh position={[0, 0.01, win.z]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[win.w + 0.02, win.d + 0.02]} />
        <meshPhysicalMaterial color="#6a5fa8" transparent opacity={0.2} roughness={0.05} clearcoat={1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.0615, LID.d / 2]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[LID.w, LID.d]} />
        <meshBasicMaterial map={print} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

const JACK: [number, number, number] = [-1.42, LABEL_Y, FRONT_Z];

function Cable() {
  const geo = useMemo(() => {
    const [x, y, z] = JACK;
    const floor = BOTTOM + 0.03;
    const pts = [
      [x, y, z + 0.08], [x, y - 0.02, z + 0.35], [x + 0.12, floor + 0.05, z + 0.7], [x + 0.6, floor, z + 1.2],
      [x + 2, floor, z + 1.9], [x + 3.4, floor, z + 2.9], [x + 4.4, floor, z + 5.2], [x + 5, floor, z + 10],
    ].map(([px, py, pz]) => new Vector3(px, py, pz));
    return new CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  }, []);
  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[geo, 240, 0.028, 10, false]} />
        <meshStandardMaterial color="#0c0b10" roughness={0.55} />
      </mesh>
      {/* Phones jack: green ring like the replica, plug seated in it. */}
      <mesh position={[JACK[0], JACK[1], FRONT_Z + 0.004]}>
        <ringGeometry args={[0.05, 0.072, 32]} />
        <meshStandardMaterial color="#2fa65a" roughness={0.4} />
      </mesh>
      <mesh position={[JACK[0], JACK[1], FRONT_Z + 0.09]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.16, 20]} />
        <meshStandardMaterial color="#15141a" roughness={0.3} metalness={0.3} />
      </mesh>
    </group>
  );
}

const KEYS: { name: ButtonName; x: number; label: string }[] = [
  { name: 'prev', x: -0.78, label: '◀◀ AMS' },
  { name: 'play', x: -0.44, label: 'PLAY' },
  { name: 'stop', x: -0.1, label: 'STOP' },
  { name: 'next', x: 0.24, label: 'AMS ▶▶' },
];
const KEY_SIZE: [number, number] = [0.27, 0.13];
const CAP_W = W / 2 - END_X;
const CAP_X = END_X + CAP_W / 2;
const OPEN_X = CAP_X;
/** Rotates a button's outward axis (+y) to face the front edge (+z). */
const FACE_FRONT: [number, number, number] = [Math.PI / 2, 0, 0];
const LCD_W = 1.2;
const LCD_D = LCD_W * (LCD_SIZE.h / LCD_SIZE.w);

export function Player({ deck }: { deck: Deck }) {
  const print = useMemo(
    () => frontPrint([
      { x: JACK[0] + 0.3, text: 'PHONES' },
      ...KEYS.map((k) => ({ x: k.x, text: k.label })),
      { x: OPEN_X, text: 'OPEN' },
    ]),
    [],
  );
  const bezel = useMemo(
    () => slab(
      { x: 0, z: 0, w: LCD_D + 0.09, d: LCD_W + 0.11, r: 0.08 },
      0.012,
      { x: 0, z: 0, w: LCD_D + 0.015, d: LCD_W + 0.02, r: 0.03 },
      0.008,
    ),
    [],
  );
  const bayW = END_X + W / 2;
  const wallH = LID_HINGE_Y - 0.06 - FLOOR;
  const wallY = FLOOR + wallH / 2;

  return (
    <group position={PLAYER_POS} rotation-y={PLAYER_YAW}>
      {/* Lower shell under the bay; its end tucks inside the end section so the join is hidden. */}
      <RoundedBox args={[bayW + 0.1, FLOOR - BOTTOM, D - 0.004]} radius={0.07} smoothness={5} position={[-W / 2 + (bayW + 0.1) / 2, (FLOOR + BOTTOM) / 2, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={BODY} roughness={0.42} clearcoat={0.4} clearcoatRoughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[bayW - 0.02, 0.03, D + 0.02]} radius={0.012} smoothness={3} position={[-W / 2 + bayW / 2, FLOOR, 0]}>
        <meshStandardMaterial color={TRIM} roughness={0.25} metalness={0.85} />
      </RoundedBox>

      {/* Matte black end section, flush with the lid top, LCD set into it. */}
      <RoundedBox args={[CAP_W, TOP - BOTTOM, D]} radius={0.08} smoothness={6} position={[CAP_X, (TOP + BOTTOM) / 2, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={CAP} roughness={0.7} clearcoat={0.15} />
      </RoundedBox>
      <group position={[CAP_X, TOP, -0.12]}>
        <mesh geometry={bezel} position-y={0.007}>
          <meshPhysicalMaterial color="#07060c" roughness={0.25} clearcoat={1} />
        </mesh>
        {/* Reads lengthwise: PGM NO. at the front, time running towards the back. */}
        <group rotation-y={Math.PI / 2} position-y={0.0015}>
          <LCD deck={deck} width={LCD_W} />
          <mesh position-y={0.003} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[LCD_W + 0.01, LCD_D + 0.01]} />
            <meshPhysicalMaterial color="#ffffff" transparent opacity={0.06} roughness={0.02} clearcoat={1} depthWrite={false} />
          </mesh>
        </group>
      </group>

      {/* Tape bay under the lid, walled on three sides; the end section is the fourth. */}
      <mesh position={[LID_X, FLOOR + 0.016, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[bayW - 0.1, D - 0.1]} />
        <meshStandardMaterial color="#110e22" roughness={0.8} />
      </mesh>
      {[-0.435, 0.435].map((x) => (
        <mesh key={x} position={[LID_X + x, FLOOR + 0.03, SLOT.z + 0.418]}>
          <cylinderGeometry args={[0.04, 0.055, 0.03, 16]} />
          <meshStandardMaterial color="#b9b3d3" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      {[
        { p: [LID_X, wallY, -D / 2 + 0.03], s: [bayW - 0.02, wallH, 0.06] },
        { p: [LID_X, wallY, D / 2 - 0.03], s: [bayW - 0.02, wallH, 0.06] },
        { p: [-W / 2 + 0.03, wallY, 0], s: [0.06, wallH, D] },
      ].map(({ p, s }, i) => (
        <RoundedBox key={i} args={s as [number, number, number]} radius={0.02} position={p as [number, number, number]} castShadow receiveShadow>
          <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} />
        </RoundedBox>
      ))}
      <Lid deck={deck} />

      {/* Keys along the front edge, round OPEN on the end section. */}
      {KEYS.map((k) => (
        <Button key={k.name} name={k.name} deck={deck} position={[k.x, KEY_Y, FRONT_Z]} rotation={FACE_FRONT} size={KEY_SIZE} />
      ))}
      <Button name="open" deck={deck} position={[OPEN_X, KEY_Y, FRONT_Z]} rotation={FACE_FRONT} round size={[0.2, 0.2]} />
      <mesh position={[FRONT_PRINT.x0 + FRONT_PRINT.w / 2, LABEL_Y, FRONT_Z + 0.003]}>
        <planeGeometry args={[FRONT_PRINT.w, FRONT_PRINT.h]} />
        <meshBasicMaterial map={print} transparent toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Hold switch on the left end, red dot showing. */}
      <group position={[-W / 2 - 0.003, KEY_Y, -0.45]} rotation-y={-Math.PI / 2}>
        <mesh>
          <planeGeometry args={[0.3, 0.08]} />
          <meshStandardMaterial color="#07060c" roughness={0.6} />
        </mesh>
        <mesh position={[0.06, 0, 0.015]}>
          <boxGeometry args={[0.11, 0.06, 0.03]} />
          <meshStandardMaterial color="#1b1730" roughness={0.5} />
        </mesh>
        <mesh position={[-0.09, 0.1, 0.001]}>
          <circleGeometry args={[0.018, 16]} />
          <meshBasicMaterial color="#e0402f" toneMapped={false} />
        </mesh>
      </group>

      <Cable />
    </group>
  );
}
