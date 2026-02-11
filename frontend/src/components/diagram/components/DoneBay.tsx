"use client";

import { RoundedBox, Text } from "@react-three/drei";

type DoneBayProps = {
  completedCount: number;
  focusMode?: boolean;
};

export function DoneBay({ completedCount, focusMode = false }: DoneBayProps) {
  return (
    <group position={[4.46, 1.02, -0.24]}>
      <RoundedBox args={[1.48, 0.24, 1.1]} radius={0.08} smoothness={5}>
        <meshStandardMaterial
          color="#0f1724"
          roughness={0.35}
          metalness={0.78}
          transparent
          opacity={focusMode ? 0.26 : 0.96}
        />
      </RoundedBox>

      {Array.from({ length: 4 }).map((_, index) => (
        <mesh key={`done-slot-${index}`} position={[-0.44 + index * 0.3, 0.06, 0.1]}>
          <boxGeometry args={[0.22, 0.016, 0.52]} />
          <meshStandardMaterial
            color="#122033"
            emissive="#22c55e"
            emissiveIntensity={focusMode ? 0.03 : 0.08}
            transparent
            opacity={focusMode ? 0.24 : 0.7}
          />
        </mesh>
      ))}

      <Text
        position={[0, 0.12, 0.38]}
        fontSize={0.062}
        color="#9db1cf"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {`DONE ${completedCount}`}
      </Text>
    </group>
  );
}
