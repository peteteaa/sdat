import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { ExtrudeGeometry, Path, Quaternion, Shape, Vector3, type Group } from 'three';
import { EJECT_T, LOAD_T, type Deck } from './deck';
import { CASSETTE, FACE, HOVER, WHEEL_STEP, clamp, ease, slotPose, wheelPose } from './layout';
import { HUB_UV, cassetteFace, cassetteSpine } from './textures';
import type { Track } from './tracks';

/** Toothed hub ring like the one visible through the SDAT lid. */
function makeHubRing() {
  const s = new Shape();
  s.absarc(0, 0, 0.13, 0, Math.PI * 2, false);
  const hole = new Path();
  const teeth = 6;
  for (let i = 0; i <= teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? 0.088 : 0.068;
    if (i === 0) hole.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else hole.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.holes.push(hole);
  return new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false, curveSegments: 24 });
}

let hubRing: ExtrudeGeometry | null = null;

function Hub({ x, y, spinRef }: { x: number; y: number; spinRef: (g: Group | null) => void }) {
  hubRing ??= makeHubRing();
  return (
    <group position={[x, y, CASSETTE.t / 2 + 0.003]} ref={spinRef}>
      <mesh geometry={hubRing}>
        <meshStandardMaterial color="#c8c0e0" roughness={0.35} metalness={0.2} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} rotation-z={(i * Math.PI * 2) / 3} position-z={0.012}>
          <boxGeometry args={[0.02, 0.15, 0.012]} />
          <meshStandardMaterial color="#8d84b4" roughness={0.4} />
        </mesh>
      ))}
      <mesh rotation-x={Math.PI / 2} position-z={0.012}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#d9d3ee" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

const pA = new Vector3();
const pB = new Vector3();
const qA = new Quaternion();
const qB = new Quaternion();

/** Fly between two poses along an arc. */
function arc(t: number, pos: Vector3, quat: Quaternion) {
  pos.lerpVectors(pA, pB, t);
  pos.y += Math.sin(Math.PI * t) * 0.9;
  quat.slerpQuaternions(qA, qB, t);
}

export function Cassette({ track, index, deck }: { track: Track; index: number; deck: Deck }) {
  const root = useRef<Group>(null);
  const hubs = useRef<(Group | null)[]>([]);
  const face = useMemo(() => cassetteFace(track), [track]);
  const spine = useMemo(() => cassetteSpine(track), [track]);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const { position: pos, quaternion: quat } = g;
    const a = deck.anim;
    let scale = 1;

    if (a && a.index === index) {
      if (a.kind === 'load') {
        if (a.t < LOAD_T.fly) {
          wheelPose(index, deck.scroll, pA, qA);
          slotPose(HOVER, pB, qB);
          arc(ease(a.t / LOAD_T.fly), pos, quat);
        } else {
          const e = ease(clamp((a.t - LOAD_T.fly) / (LOAD_T.drop - LOAD_T.fly), 0, 1));
          slotPose(HOVER * (1 - e), pos, quat);
        }
      } else if (a.t < EJECT_T.rise) {
        const e = ease(clamp((a.t - EJECT_T.open) / (EJECT_T.rise - EJECT_T.open), 0, 1));
        slotPose(HOVER * e, pos, quat);
      } else {
        slotPose(HOVER, pA, qA);
        wheelPose(index, deck.scroll, pB, qB);
        arc(ease(clamp((a.t - EJECT_T.rise) / (EJECT_T.fly - EJECT_T.rise), 0, 1)), pos, quat);
      }
    } else if (deck.loaded === index) {
      slotPose(0, pos, quat);
    } else {
      const th = Math.abs(wheelPose(index, deck.scroll, pos, quat));
      const focus = Math.max(0, 1 - th / WHEEL_STEP);
      scale = clamp((1.75 - th) / 0.4, 0, 1) * (1 + 0.06 * focus);
    }

    g.visible = scale > 0.001;
    g.scale.setScalar(Math.max(scale, 0.001));

    if (deck.isMounted(index)) {
      for (const h of hubs.current) if (h) h.rotation.z -= deck.spin * dt;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return;
    if (deck.loaded === index) deck.togglePlay();
    else deck.load(index);
  };

  const hubPos = HUB_UV.map(([u, v]) => [(u / 512 - 0.5) * FACE.w, (0.5 - v / 372) * FACE.h] as const);

  return (
    <group
      ref={root}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <RoundedBox args={[CASSETTE.w, CASSETTE.h, CASSETTE.t]} radius={0.06} smoothness={3} castShadow receiveShadow>
        <meshPhysicalMaterial color="#1d1b25" roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} />
      </RoundedBox>
      <mesh position-z={CASSETTE.t / 2 + 0.002}>
        <planeGeometry args={[FACE.w, FACE.h]} />
        <meshStandardMaterial map={face} roughness={0.55} />
      </mesh>
      <mesh position-y={CASSETTE.h / 2 + 0.002} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[CASSETTE.w - 0.16, (CASSETTE.t - 0.08) ]} />
        <meshStandardMaterial map={spine} roughness={0.6} />
      </mesh>
      {hubPos.map(([x, y], i) => (
        <Hub key={i} x={x} y={y} spinRef={(g) => (hubs.current[i] = g)} />
      ))}
    </group>
  );
}
