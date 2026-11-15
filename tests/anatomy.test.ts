import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Box3, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareAnatomyModel } from '../src/anatomy/prepareModel';
import { getFocusCodes, type AnatomyFocus } from '../src/anatomy/regions';

const asset = readFile('assets/models/heatsy/body.glb').then((file) =>
  new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), ''));

test('the actual asset keeps a human-scale skinned body without double decoding', async () => {
  const gltf = await asset;
  const model = prepareAnatomyModel(gltf.scene);
  model.scene.updateMatrixWorld(true);
  model.meshes.forEach((mesh) => mesh.skeleton.update());
  const bounds = new Box3().setFromObject(model.scene, true);
  assert.ok(bounds.max.y - bounds.min.y > 1.5);
  assert.ok(bounds.max.y - bounds.min.y < 2);
  assert.equal(model.meshes[0].skeleton.bones.length, 56);
  model.dispose();
});

test('region focus selects only matching actual vertices and can return to all-gray', async () => {
  const gltf = await asset;
  const model = prepareAnatomyModel(gltf.scene);
  for (const focus of ['shoulders', 'upper_back'] as AnatomyFocus[]) {
    model.setFocus(focus);
    const codes = getFocusCodes(focus);
    let count = 0;
    for (const mesh of model.meshes) {
      const parts = mesh.geometry.getAttribute('_part_id');
      const mask = mesh.geometry.getAttribute('anatomyFocus');
      for (let i = 0; i < mask.count; i++) {
        assert.equal(mask.getX(i), codes.has(parts.getX(i)) ? 1 : 0);
        count += mask.getX(i);
      }
    }
    assert.ok(count > 0, `${focus} must have geometry, not just a metadata entry`);
  }
  model.setFocus('none');
  model.meshes.forEach((mesh) => assert.ok(Array.from(mesh.geometry.getAttribute('anatomyFocus').array).every((value) => value === 0)));
  model.dispose();
});

test('viewports have independent skeletons and highlighting without mutating cached geometry', async () => {
  const gltf = await asset;
  const first = prepareAnatomyModel(gltf.scene);
  const second = prepareAnatomyModel(gltf.scene);
  first.setFocus('shoulders');
  assert.notEqual(first.meshes[0].skeleton, second.meshes[0].skeleton);
  assert.notEqual(first.meshes[0].skeleton.bones[0], second.meshes[0].skeleton.bones[0]);
  assert.ok(Array.from(second.meshes[0].geometry.getAttribute('anatomyFocus').array).every((value) => value === 0));
  gltf.scene.traverse((object) => {
    if (object instanceof SkinnedMesh) assert.equal(object.geometry.getAttribute('anatomyFocus'), undefined);
  });
  first.dispose();
  second.dispose();
});
