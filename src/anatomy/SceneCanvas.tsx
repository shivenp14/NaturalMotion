import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnatomyScene, type AnatomySceneProps } from './AnatomyScene';

/** Web fallback; Metro selects SceneCanvas.native.tsx on Android/iOS. */
export function SceneCanvas(props: AnatomySceneProps) {
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [0, 0.86, 3.65], fov: 28, near: 0.01, far: 15 }}
      onCreated={({ camera }) => { camera.lookAt(0, 0.86, 0); }}
      gl={{ antialias: true, alpha: false }}>
      <Suspense fallback={null}><AnatomyScene {...props} /></Suspense>
    </Canvas>
  );
}
