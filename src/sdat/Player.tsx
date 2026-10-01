import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import {
  CatmullRomCurve3, ExtrudeGeometry, Shape, Vector3,
  type Group, type Mesh, type MeshStandardMaterial,
} from 'three';
import type { ButtonName, Deck } from './deck';
import { PLAYER_POS, PLAYER_YAW, damp } from './layout';
import { LCD_SIZE, drawLCD, iconTexture, logoTexture, platePrint, canvasTexture } from './textures';

export const BODY = '#2b2456';
const BODY_DARK = '#1c173b';
const TRIM = '#8f86c2';

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
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth - bevel, 0);
  return g;
}

function LCD({ deck }: { deck: Deck }) {
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
    <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[1.8, 1.8 * (LCD_SIZE.h / LCD_SIZE.w)]} />
      <meshStandardMaterial ref={mat} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.12} roughness={0.55} />
    </mesh>
  );
}

function Button({ name, deck, x, z }: { name: ButtonName; deck: Deck; x: number; z: number }) {
  const cap = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const icon = useMemo(() => iconTexture(name), [name]);
  const recess = useMemo(() => slab({ x: 0, z: 0, w: 0.42, d: 0.4, r: 0.08 }, 0.01, { x: 0, z: 0, w: 0.36, d: 0.34, r: 0.06 }, 0.005), []);

  useFrame(() => {
    const since = deck.clock - (deck.presses[name] ?? -10);
    const press = since < 0.14 ? 0.045 : 0;
    if (cap.current) cap.current.position.y = damp(cap.current.position.y, 0.035 - press + (hover ? 0.01 : 0), 30, 1 / 60);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    deck.press(name);
  };

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={recess} position-y={0.012}>
        <meshStandardMaterial color="#0e0b1f" roughness={0.6} />
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
        <RoundedBox args={[0.34, 0.1, 0.32]} radius={0.035} smoothness={3} castShadow>
          <meshPhysicalMaterial color={hover ? '#3d3574' : BODY_DARK} roughness={0.4} clearcoat={0.5} />
        </RoundedBox>
        <mesh position-y={0.051} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshBasicMaterial map={icon} transparent toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function Lid({ deck }: { deck: Deck }) {
  const hinge = useRef<Group>(null);
  const logo = useMemo(() => logoTexture(), []);
  // Lid spans x ±1.2, z 0..3.2 from the hinge; window sits over the tape hubs.
  const geo = useMemo(
    () => slab({ x: 0, z: 1.6, w: 2.36, d: 3.16, r: 0.12 }, 0.1, { x: 0, z: 1.97, w: 1.95, d: 0.92, r: 0.3 }),
    [],
  );
  const bezel = useMemo(
    () => slab({ x: 0, z: 1.97, w: 2.15, d: 1.1, r: 0.38 }, 0.012, { x: 0, z: 1.97, w: 1.95, d: 0.92, r: 0.3 }, 0.01),
    [],
  );

  useFrame(() => {
    if (hinge.current) hinge.current.rotation.x = -deck.lid * 1.85;
  });

  return (
    <group ref={hinge} position={[1.2, 0.59, -1.6]}>
      <mesh geometry={geo} position-y={0.07} castShadow receiveShadow>
        <meshPhysicalMaterial color={BODY} roughness={0.42} clearcoat={0.35} clearcoatRoughness={0.4} />
      </mesh>
      <mesh geometry={bezel} position-y={0.085}>
        <meshStandardMaterial color="#120f26" roughness={0.3} />
      </mesh>
      {/* Smoked window glass. */}
      <mesh position={[0, 0.02, 1.97]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.97, 0.94]} />
        <meshPhysicalMaterial color="#6a5fa8" transparent opacity={0.22} roughness={0.05} clearcoat={1} depthWrite={false} />
      </mesh>
      <mesh position={[0.42, 0.072, 2.78]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.2, 0.4]} />
        <meshBasicMaterial map={logo} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Cable() {
  const geo = useMemo(() => {
    // Runs off behind the player, clear of the carousel.
    const pts = [
      [-2.45, -0.05, -0.9], [-2.75, -0.12, -1.15], [-2.95, -0.4, -1.7], [-2.6, -0.43, -2.6],
      [-1.4, -0.43, -3.3], [0.4, -0.43, -4.2], [1.4, -0.43, -6.5], [0.8, -0.43, -12],
    ].map(([x, y, z]) => new Vector3(x, y, z));
    return new CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  }, []);
  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[geo, 240, 0.035, 10, false]} />
        <meshStandardMaterial color="#0c0b10" roughness={0.55} />
      </mesh>
      <mesh position={[-2.52, -0.05, -0.9]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.22, 20]} />
        <meshStandardMaterial color="#15141a" roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[-2.405, -0.05, -0.9]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.045, 0.045, 0.02, 20]} />
        <meshStandardMaterial color="#d8d4e8" roughness={0.2} metalness={1} />
      </mesh>
    </group>
  );
}

export function Player({ deck }: { deck: Deck }) {
  const print = useMemo(() => platePrint(), []);
  const bayFloor = useRef<Mesh>(null);
  const bezel = useMemo(
    () => slab({ x: 0, z: 0, w: 2.1, d: 1.36, r: 0.26 }, 0.02, { x: 0, z: 0, w: 1.82, d: 1.03, r: 0.06 }, 0.012),
    [],
  );
  const buttons: ButtonName[] = ['prev', 'play', 'stop', 'next', 'open'];

  return (
    <group position={PLAYER_POS} rotation-y={PLAYER_YAW}>
      {/* Main shell. */}
      <RoundedBox args={[4.8, 0.66, 3.2]} radius={0.14} smoothness={5} position-y={-0.12} castShadow receiveShadow>
        <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} clearcoatRoughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[4.84, 0.06, 3.24]} radius={0.03} smoothness={3} position-y={-0.02}>
        <meshStandardMaterial color={TRIM} roughness={0.25} metalness={0.8} />
      </RoundedBox>

      {/* Left deck plate with LCD and transport keys. */}
      <RoundedBox args={[2.38, 0.46, 3.2]} radius={0.08} smoothness={4} position={[-1.2, 0.43, 0]} castShadow receiveShadow>
        <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} clearcoatRoughness={0.5} />
      </RoundedBox>
      <group position={[-1.22, 0.66, -0.58]}>
        <mesh geometry={bezel} position-y={0.02}>
          <meshPhysicalMaterial color="#0d0a1c" roughness={0.25} clearcoat={1} />
        </mesh>
        <LCD deck={deck} />
        <mesh position-y={0.012} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1.84, 1.05]} />
          <meshPhysicalMaterial color="#ffffff" transparent opacity={0.06} roughness={0.02} clearcoat={1} depthWrite={false} />
        </mesh>
      </group>
      <group position-y={0.66}>
        {buttons.map((b, i) => (
          <Button key={b} name={b} deck={deck} x={-2.0 + i * 0.43} z={0.5} />
        ))}
      </group>
      <mesh position={[-1.2, 0.662, 1.04]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.2, 0.55]} />
        <meshBasicMaterial map={print} transparent toneMapped={false} depthWrite={false} />
      </mesh>

      {/* Cassette bay. */}
      <mesh ref={bayFloor} position={[1.2, 0.212, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2.3, 3.0]} />
        <meshStandardMaterial color="#110e22" roughness={0.8} />
      </mesh>
      {[-0.435, 0.435].map((x) => (
        <mesh key={x} position={[1.2 + x, 0.24, -0.05 + 0.42]}>
          <cylinderGeometry args={[0.05, 0.07, 0.06, 16]} />
          <meshStandardMaterial color="#b9b3d3" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      {[
        { p: [1.2, 0.37, -1.54], s: [2.36, 0.34, 0.12] },
        { p: [1.2, 0.37, 1.54], s: [2.36, 0.34, 0.12] },
        { p: [2.34, 0.37, 0], s: [0.12, 0.34, 3.2] },
      ].map(({ p, s }, i) => (
        <RoundedBox key={i} args={s as [number, number, number]} radius={0.03} position={p as [number, number, number]} castShadow receiveShadow>
          <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} />
        </RoundedBox>
      ))}

      <Lid deck={deck} />
      <Cable />
    </group>
  );
}
