import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { BODY } from './Player';
import type { Deck } from './deck';
import { WHEEL_POS, WHEEL_R, WHEEL_STEP, WHEEL_TILT, WHEEL_YAW } from './layout';

const SIDE = 1.32;
const METAL = { color: '#b7b1cf', metalness: 0.85, roughness: 0.28 };

/** Stand, axle and spoked rims the cassettes ride on. */
export function Wheel({ deck }: { deck: Deck }) {
  const spin = useRef<Group>(null);

  useFrame(() => {
    if (spin.current) spin.current.rotation.x = deck.scroll * WHEEL_STEP;
  });

  return (
    <group position={WHEEL_POS} rotation-y={WHEEL_YAW}>
      {[-1, 1].map((s) => (
        <group key={s} position-x={s * (SIDE + 0.12)}>
          <mesh position-y={-WHEEL_POS.y / 2} castShadow>
            <boxGeometry args={[0.1, WHEEL_POS.y, 0.22]} />
            <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} />
          </mesh>
          <mesh position-y={-WHEEL_POS.y + 0.04} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.08, 1.4]} />
            <meshPhysicalMaterial color={BODY} roughness={0.45} clearcoat={0.3} />
          </mesh>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.2, 0.2, 0.12, 32]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      ))}
      <group rotation-x={WHEEL_TILT}>
        <group ref={spin}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.06, 0.06, SIDE * 2 + 0.3, 16]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position-x={s * SIDE}>
              <mesh rotation-y={Math.PI / 2}>
                <torusGeometry args={[WHEEL_R - 0.3, 0.025, 8, 96]} />
                <meshStandardMaterial {...METAL} />
              </mesh>
              {Array.from({ length: 12 }, (_, i) => (
                <group key={i} rotation-x={(i / 12) * Math.PI * 2}>
                  <mesh position-y={(WHEEL_R - 0.3) / 2}>
                    <cylinderGeometry args={[0.012, 0.012, WHEEL_R - 0.3, 6]} />
                    <meshStandardMaterial {...METAL} />
                  </mesh>
                </group>
              ))}
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}
