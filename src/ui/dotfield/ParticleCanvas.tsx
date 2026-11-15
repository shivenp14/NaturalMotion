import { Canvas } from '@react-three/fiber';
import { ParticleScene } from './ParticleScene';

export function ParticleCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  return <Canvas frameloop={reducedMotion ? 'demand' : 'always'} dpr={[1, 1.5]} gl={{ alpha: true, antialias: false }}>
    <ParticleScene reducedMotion={reducedMotion} />
  </Canvas>;
}
