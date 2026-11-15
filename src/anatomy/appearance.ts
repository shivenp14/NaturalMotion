import { Color, DoubleSide, MeshStandardMaterial } from 'three';

/** Cosmetic art direction. Fiber contrast is not muscle activation. */
export const anatomyAppearance = {
  background: '#ffffff',
  graphite: '#777777',
  highlight: '#444444',
  roughness: 0.78,
  fiberContrast: 0.2,
  fiberFrequency: 2300,
  positionUnitMetres: 0.0001,
} as const;

/** Uses the original per-vertex fiber directions; no UV texture or model edits. */
export function createAnatomyMaterial() {
  const material = new MeshStandardMaterial({
    color: anatomyAppearance.graphite,
    roughness: anatomyAppearance.roughness,
    metalness: 0,
    side: DoubleSide,
  });
  material.customProgramCacheKey = () => 'naturalmotion-graphite-fibers-v1';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.anatomyHighlight = { value: new Color(anatomyAppearance.highlight) };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec3 _fiber;
      attribute float _part_id;
      attribute float _tendon;
      attribute float anatomyFocus;
      varying vec3 anatomyPosition;
      varying vec3 anatomyNormal;
      varying vec3 anatomyFiber;
      varying float anatomyMuscle;
      varying float anatomySelected;
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      anatomyPosition = position * ${anatomyAppearance.positionUnitMetres};
      anatomyNormal = normal;
      anatomyFiber = _fiber;
      anatomyMuscle = step(0.5, _part_id) * (1.0 - _tendon);
      anatomySelected = anatomyFocus;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      uniform vec3 anatomyHighlight;
      varying vec3 anatomyPosition;
      varying vec3 anatomyNormal;
      varying vec3 anatomyFiber;
      varying float anatomyMuscle;
      varying float anatomySelected;
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 acrossFiber = cross(normalize(anatomyNormal), normalize(anatomyFiber + vec3(0.00001)));
      acrossFiber /= max(length(acrossFiber), 0.001);
      float strand = dot(anatomyPosition, acrossFiber) * ${anatomyAppearance.fiberFrequency.toFixed(1)};
      float contrast = ${anatomyAppearance.fiberContrast.toFixed(2)} / (1.0 + fwidth(strand) * 0.4);
      float grain = 1.0 - anatomyMuscle * contrast * (0.5 + 0.5 * sin(strand));
      diffuseColor.rgb = mix(diffuseColor.rgb, anatomyHighlight, anatomySelected) * grain;
    `);
  };
  return material;
}
