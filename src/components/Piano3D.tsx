import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Theme } from '../themes';
import { isBlackKey, getKeyRange } from '../utils/chordDetection';

interface Piano3DProps {
  activeNotes: Set<number>;
  theme: Theme;
}

interface KeyMeshProps {
  position: [number, number, number];
  isBlack: boolean;
  isActive: boolean;
  theme: Theme;
  midiNote: number;
}

function KeyMesh({ position, isBlack, isActive, theme }: Omit<KeyMeshProps, 'midiNote'>) {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetRotation = useRef(0);
  const currentRotation = useRef(0);

  // Key dimensions
  const whiteKeyWidth = 0.22;
  const whiteKeyHeight = 0.12;
  const whiteKeyDepth = 1.2;
  const blackKeyWidth = 0.14;
  const blackKeyHeight = 0.1;
  const blackKeyDepth = 0.75;

  const width = isBlack ? blackKeyWidth : whiteKeyWidth;
  const height = isBlack ? blackKeyHeight : whiteKeyHeight;
  const depth = isBlack ? blackKeyDepth : whiteKeyDepth;

  // Set target rotation based on active state
  targetRotation.current = isActive ? -0.05 : 0;

  useFrame((_, delta) => {
    if (meshRef.current) {
      // Smooth interpolation for key press animation
      currentRotation.current = THREE.MathUtils.lerp(
        currentRotation.current,
        targetRotation.current,
        delta * 20
      );
      meshRef.current.rotation.x = currentRotation.current;
    }
  });

  // White keys are ivory/off-white, black keys are dark
  const inactiveColor = isBlack ? '#1a1a1a' : '#f5f5f0';
  // Active keys glow with the theme color
  const color = isActive ? theme.colors.primary : inactiveColor;

  // Emissive glow when active
  const emissive = isActive ? theme.colors.primaryGlow : '#000000';
  const emissiveIntensity = isActive ? 0.5 : 0;

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={color}
        roughness={isBlack ? 0.3 : 0.5}
        metalness={isBlack ? 0.1 : 0.05}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

function PianoBody({ theme }: { theme: Theme }) {
  return (
    <group position={[0, -0.15, 0.1]}>
      {/* Main body */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[7.5, 0.2, 1.8]} />
        <meshStandardMaterial
          color="#1a1a1a"
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>
      {/* Front edge */}
      <mesh position={[0, 0.05, 0.85]} receiveShadow>
        <boxGeometry args={[7.5, 0.1, 0.1]} />
        <meshStandardMaterial
          color={theme.colors.primary}
          roughness={0.3}
          metalness={0.5}
          emissive={theme.colors.primaryGlow}
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

function PianoKeys({ activeNotes, theme }: { activeNotes: Set<number>; theme: Theme }) {
  const { start, end } = getKeyRange();

  const keys = useMemo(() => {
    const result: { midiNote: number; isBlack: boolean; position: [number, number, number] }[] = [];
    let whiteKeyIndex = 0;

    const whiteKeyWidth = 0.22;
    const whiteKeyHeight = 0.12;
    const blackKeyHeight = 0.1;
    const whiteKeyDepth = 1.2;
    const blackKeyDepth = 0.75;

    // Count white keys first
    const whiteKeyCount = Array.from({ length: end - start + 1 })
      .filter((_, i) => !isBlackKey(start + i)).length;

    const startOffset = -(whiteKeyCount * whiteKeyWidth) / 2 + whiteKeyWidth / 2;

    for (let note = start; note <= end; note++) {
      const black = isBlackKey(note);

      if (black) {
        // Position black key relative to the previous white key
        const x = startOffset + (whiteKeyIndex - 1) * whiteKeyWidth + whiteKeyWidth / 2;
        const y = whiteKeyHeight / 2 + blackKeyHeight / 2;
        const z = -whiteKeyDepth / 2 + blackKeyDepth / 2;

        result.push({
          midiNote: note,
          isBlack: true,
          position: [x, y, z],
        });
      } else {
        const x = startOffset + whiteKeyIndex * whiteKeyWidth;
        const y = 0;
        const z = 0;

        result.push({
          midiNote: note,
          isBlack: false,
          position: [x, y, z],
        });

        whiteKeyIndex++;
      }
    }

    return result;
  }, [start, end]);

  return (
    <group position={[0, 0, 0]}>
      {/* White keys first (behind) */}
      {keys.filter(k => !k.isBlack).map(key => (
        <KeyMesh
          key={key.midiNote}
          position={key.position}
          isBlack={false}
          isActive={activeNotes.has(key.midiNote)}
          theme={theme}
        />
      ))}
      {/* Black keys on top */}
      {keys.filter(k => k.isBlack).map(key => (
        <KeyMesh
          key={key.midiNote}
          position={key.position}
          isBlack={true}
          isActive={activeNotes.has(key.midiNote)}
          theme={theme}
        />
      ))}
    </group>
  );
}

function Scene({ activeNotes, theme }: { activeNotes: Set<number>; theme: Theme }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight
        position={[0, 3, 2]}
        intensity={0.5}
        color={theme.colors.primaryGlow}
      />

      {/* Piano */}
      <group position={[0, 0, 0]} rotation={[0.1, 0, 0]}>
        <PianoBody theme={theme} />
        <PianoKeys activeNotes={activeNotes} theme={theme} />
      </group>

      {/* Floor shadow */}
      <ContactShadows
        position={[0, -0.35, 0]}
        opacity={0.4}
        scale={15}
        blur={2}
        far={5}
      />

      {/* Environment for reflections */}
      <Environment preset="city" />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={3}
        maxDistance={8}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function Piano3D({ activeNotes, theme }: Piano3DProps) {
  return (
    <div
      className="w-full h-full rounded-xl overflow-hidden"
      style={{
        background: `radial-gradient(ellipse at center, ${theme.colors.surface} 0%, ${theme.colors.background} 100%)`,
      }}
    >
      <Canvas
        shadows
        camera={{ position: [0, 2.5, 4], fov: 50 }}
        gl={{ antialias: true }}
      >
        <Scene activeNotes={activeNotes} theme={theme} />
      </Canvas>
    </div>
  );
}
