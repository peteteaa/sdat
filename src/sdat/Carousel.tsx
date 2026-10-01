import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { Deck } from './deck';
import { CAROUSEL_POS, FRONT, HUB_R, PLATTER_R, PLATTER_TOP, slotCount, slotStep } from './layout';
import { dialTexture, platterTexture } from './textures';

const METAL = { color: '#c4c3cc', metalness: 0.9, roughness: 0.3 };
const BASE_TOP = PLATTER_TOP - 0.08;

/** Turntable cassette changer: a brushed platter with radial slots and a numbered dial. */
export function Carousel({ deck }: { deck: Deck }) {
  const spin = useRef<Group>(null);
  const n = deck.tracks.length;
  const slots = slotCount(n);
  const step = slotStep(n);

  const [platter, dial] = useMemo(() => {
    const angleOf = (i: number) => FRONT + i * step;
    return [platterTexture(slots, angleOf, PLATTER_R, HUB_R + 0.05, PLATTER_R - 0.08), dialTexture(slots, angleOf)];
  }, [slots, step]);

  useFrame(() => {
    if (spin.current) spin.current.rotation.y = -deck.scroll * step;
  });

  return (
    <group position={CAROUSEL_POS}>
      {/* Black deck the platter sits in. */}
      <mesh position-y={BASE_TOP / 2} castShadow receiveShadow>
        <cylinderGeometry args={[PLATTER_R + 0.22, PLATTER_R + 0.28, BASE_TOP, 96]} />
        <meshPhysicalMaterial color="#141218" roughness={0.35} clearcoat={0.6} />
      </mesh>
      {/* Selection pointer at the front of the deck. */}
      <group rotation-y={FRONT}>
        <mesh position={[0, BASE_TOP + 0.005, PLATTER_R + 0.13]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.09, 3, Math.PI / 2]} />
          <meshBasicMaterial color="#e0402f" toneMapped={false} />
        </mesh>
      </group>

      <group ref={spin}>
        <mesh position-y={BASE_TOP + 0.04} castShadow receiveShadow>
          <cylinderGeometry args={[PLATTER_R, PLATTER_R, 0.08, 128, 1, true]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position-y={PLATTER_TOP + 0.001} rotation-x={-Math.PI / 2} receiveShadow>
          <circleGeometry args={[PLATTER_R, 128]} />
          <meshStandardMaterial map={platter} metalness={0.75} roughness={0.35} />
        </mesh>

        <mesh position-y={PLATTER_TOP + 0.08} castShadow>
          <cylinderGeometry args={[HUB_R, HUB_R, 0.16, 96, 1, true]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
        <mesh position-y={PLATTER_TOP + 0.161} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[HUB_R, 96]} />
          <meshStandardMaterial map={dial} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position-y={PLATTER_TOP + 0.19}>
          <cylinderGeometry args={[0.12, 0.14, 0.06, 32]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      </group>
    </group>
  );
}
