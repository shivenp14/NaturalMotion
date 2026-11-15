import { Canvas } from '@react-three/fiber/native';
import { ParticleScene } from './ParticleScene';

export function ParticleCanvas({ reducedMotion }: { reducedMotion: boolean }) {
  return <Canvas frameloop={reducedMotion ? 'demand' : 'always'} gl={{ alpha: true, antialias: false }}>
    <ParticleScene reducedMotion={reducedMotion} />
  </Canvas>;
}
