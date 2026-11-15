import { BufferAttribute, SkinnedMesh, type Object3D } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createAnatomyMaterial } from './appearance';
import { getFocusCodes, type AnatomyFocus } from './regions';

/** Each viewport owns its skeleton, geometry, and material; loader cache stays untouched. */
export function prepareAnatomyModel(source: Object3D) {
  const scene = clone(source);
  const material = createAnatomyMaterial();
  const meshes: SkinnedMesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    const geometry = object.geometry.clone();
    for (const attribute of ['_part_id', '_fiber', '_tendon']) {
      if (!geometry.getAttribute(attribute)) throw new Error(`Anatomy asset is missing ${attribute}.`);
    }
    geometry.setAttribute('anatomyFocus', new BufferAttribute(new Float32Array(geometry.getAttribute('position').count), 1));
    object.geometry = geometry;
    object.material = material;
    // Inverse-bind matrices already decode quantized positions. Do not rescale
    // positions again. Avoid raw quantized bounds culling this single mesh.
    object.frustumCulled = false;
    meshes.push(object);
  });
  if (meshes.length === 0) throw new Error('No rigged anatomical body was found.');

  function setFocus(focus: AnatomyFocus) {
    setFocusCodes(getFocusCodes(focus));
  }

  function setFocusCodes(codes: ReadonlySet<number>) {
    for (const mesh of meshes) {
      const parts = mesh.geometry.getAttribute('_part_id');
      const selection = mesh.geometry.getAttribute('anatomyFocus');
      for (let i = 0; i < parts.count; i++) selection.setX(i, codes.has(parts.getX(i)) ? 1 : 0);
      selection.needsUpdate = true;
    }
  }

  function dispose() {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      mesh.skeleton.dispose();
    }
    material.dispose();
  }
  return { scene, material, meshes, setFocus, setFocusCodes, dispose };
}
