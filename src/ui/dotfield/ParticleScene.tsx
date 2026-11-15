/* R3F renders Three.js meshes and updates shader uniforms for each frame. */
/* eslint-disable react/no-unknown-property, react-hooks/immutability */
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ShaderMaterial, Vector2 } from 'three';

// A single-pass, mobile-sized interpretation of the supplied Mosaic Lens field.
// Each tile samples one point in the same animated ribbon field.
const vertexShader = `
  void main() {
    gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
  }
`;
const fragmentShader = `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uPixelRatio;
  mat2 rotate2d(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
  void main() {
    float tile = 12.0 * uPixelRatio;
    vec2 samplePoint = (floor(gl_FragCoord.xy / tile) + 0.5) * tile;
    vec2 pos = (samplePoint - 0.5 * uResolution) / uResolution.y;
    float time = uTime * 0.35 + 64.0;
    float breath = 0.5 + 0.20 * sin(uTime * 0.34);
    vec2 field = rotate2d(-2.2) * ((pos - vec2(-0.25, 0.10)) * (1.05 - breath * 0.085));
    mat2 fold = mat2(cos(2.12), sin(2.12), -0.956, cos(2.12));
    vec3 light = vec3(0.0);
    for (int layer = 1; layer <= 32; layer++) {
      float i = float(layer);
      field.x -= sin(field.y * 0.58 + time + i * 0.007) * 0.16;
      field.y -= sin(field.x * 2.8 - time + i * 0.02) * 0.034;
      field = fold * field * 0.949;
      vec2 q = (field - vec2(0.31 + breath * 0.1, 0.0)) * vec2(1.65, 0.22);
      float glow = 0.0021 / (dot(q, q) + 0.0019) * (0.25 + breath * 0.4);
      float radius = length(field);
      float hue = 0.5 + 0.5 * sin(i * 0.16 + time * 1.2 + radius * 2.0);
      light += glow * mix(vec3(0.09, 0.48, 0.78), vec3(0.34, 0.69, 0.95), hue)
        * (0.62 + 0.5 * hue) * exp2(-radius * 0.37);
    }
    vec3 mapped = max(light * 0.54, 0.0);
    mapped = (mapped * (2.51 * mapped + 0.03)) / (mapped * (2.43 * mapped + 0.59) + 0.14);
    float strength = clamp(max(mapped.r, max(mapped.g, mapped.b)), 0.0, 1.0);
    vec3 ink = mix(vec3(0.82, 0.92, 0.99), mapped, 0.72);
    vec2 uv = samplePoint / uResolution;
    vec2 focus = (uv - vec2(0.5, 0.55)) / vec2(0.35, 0.24);
    float logoFade = 1.0 - 0.72 * exp(-dot(focus, focus) * 1.5);
    vec3 paper = mix(vec3(1.0), ink, strength * 0.82 * logoFade);
    gl_FragColor = vec4(clamp(paper, 0.0, 1.0), 1.0);
  }
`;

export function ParticleScene({ reducedMotion }: { reducedMotion: boolean }) {
  const { gl, size, invalidate } = useThree();
  const material = useMemo(() => new ShaderMaterial({ vertexShader, fragmentShader, depthWrite: false, depthTest: false,
    uniforms: { uTime: { value: 0 }, uResolution: { value: new Vector2(1, 1) }, uPixelRatio: { value: 1 } } }), []);
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => {
    const drawingSize = gl.getDrawingBufferSize(new Vector2());
    material.uniforms.uResolution.value.copy(drawingSize);
    material.uniforms.uPixelRatio.value = drawingSize.x / Math.max(size.width, 1);
    invalidate();
  }, [gl, size, material, invalidate]);
  useFrame((_, delta) => { if (!reducedMotion) material.uniforms.uTime.value += Math.min(delta, 0.05) * 1.4; });
  return <mesh material={material} frustumCulled={false}><planeGeometry args={[1, 1]} /></mesh>;
}
