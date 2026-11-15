import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber/native';
import { AnatomyScene, type AnatomySceneProps } from './AnatomyScene';

export function SceneCanvas(props: AnatomySceneProps) {
  return (
    <Canvas frameloop="demand" camera={{ position: [0, 0.86, 3.65], fov: 28, near: 0.01, far: 15 }}
      onCreated={({ camera }) => { camera.lookAt(0, 0.86, 0); }}
      gl={{ antialias: true, alpha: false }}>
      <Suspense fallback={null}><AnatomyScene {...props} /></Suspense>
    </Canvas>
  );
}
