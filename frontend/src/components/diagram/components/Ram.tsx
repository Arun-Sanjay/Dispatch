"use client";

import { RoundedBox } from "@react-three/drei";

type RamProps = {
  dimmed?: boolean;
};

function alpha(dimmed: boolean) {
  return dimmed ? 0.16 : 1;
}

export function Ram({ dimmed = false }: RamProps) {
  return (
    <group position={[-3.8, 0.7, -0.2]}>
      <RoundedBox args={[2.5, 0.5, 1.8]} radius={0.12} smoothness={5}>
        <meshStandardMaterial
          color="#1b2433"
          transparent
          opacity={alpha(dimmed)}
          roughness={0.4}
          metalness={0.82}
        />
      </RoundedBox>

      {Array.from({ length: 2 }).map((_, moduleIndex) => (
        <group key={`ram-module-${moduleIndex}`} position={[-0.48 + moduleIndex * 0.96, 0.3, 0.05]}>
          <RoundedBox args={[0.72, 0.36, 1.4]} radius={0.06} smoothness={4}>
            <meshStandardMaterial
              color="#0f1728"
              transparent
              opacity={alpha(dimmed)}
              roughness={0.36}
              metalness={0.84}
            />
          </RoundedBox>
          {Array.from({ length: 4 }).map((__, bankIndex) => (
            <mesh key={`bank-${moduleIndex}-${bankIndex}`} position={[0, 0.02, -0.5 + bankIndex * 0.34]}>
              <boxGeometry args={[0.62, 0.18, 0.12]} />
              <meshStandardMaterial
                color="#111827"
                transparent
                opacity={alpha(dimmed)}
                emissive="#7c3aed"
                emissiveIntensity={dimmed ? 0.05 : 0.2 + (bankIndex % 2) * 0.06}
                roughness={0.32}
                metalness={0.72}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
