import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Group, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import vocabulary from '../assets/models/heatsy/muscles.json';
import { prepareAnatomyModel } from '../src/anatomy/prepareModel';
import { getFocusCodes } from '../src/anatomy/regions';
import { createWallAngelRig, sampleWallAngelCycle, validateWallAngelParameters, wallAngelDefaults } from '../src/anatomy/wallAngel';

const load = async (filename: string) => {
  const data = await readFile(`assets/models/heatsy/${filename}`);
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
};
const asset = load('body-smoothed.glb');

test('wall-angel timing holds the endpoint, returns exactly and rejects invalid inputs', () => {
  const parameters = { topAngleDeg: 145, travelSeconds: 3, holdSeconds: 1 };
  assert.equal(sampleWallAngelCycle(0, parameters).progress, 0);
  assert.equal(sampleWallAngelCycle(1.5, parameters).progress, 0.5);
  assert.deepEqual(sampleWallAngelCycle(3, parameters), { progress: 1, phase: 'holding', completed: false });
  assert.equal(sampleWallAngelCycle(4, parameters).phase, 'returning');
  assert.equal(sampleWallAngelCycle(5.5, parameters).progress, 0.5);
  assert.deepEqual(sampleWallAngelCycle(7, parameters), { progress: 0, phase: 'completed', completed: true });
  assert.equal(sampleWallAngelCycle(100, parameters).progress, 0);
  for (const bad of [NaN, Infinity, -1]) assert.throws(() => sampleWallAngelCycle(bad, parameters));
  for (const [key, value] of [['topAngleDeg', 151], ['topAngleDeg', 119], ['travelSeconds', 0], ['holdSeconds', 3], ['holdSeconds', NaN]] as const) {
    assert.throws(() => validateWallAngelParameters({ ...parameters, [key]: value }));
  }
  assert.equal(sampleWallAngelCycle(5.5, { ...parameters, travelSeconds: 5 }).phase, 'holding');
});

test('the adapted asset preserves geometry and bind matrices with normalized weights', async () => {
  const [original, adapted] = await Promise.all([load('body.glb'), asset]);
  const first = prepareAnatomyModel(original.scene);
  const second = prepareAnatomyModel(adapted.scene);
  const a = first.meshes[0];
  const b = second.meshes[0];
  for (const name of ['position', 'normal', '_part_id', '_fiber', '_tendon']) {
    // Interleaved attributes share storage with the changed skin weights;
    // compare the actual attribute components, not the entire backing array.
    const before = a.geometry.getAttribute(name);
    const after = b.geometry.getAttribute(name);
    assert.equal(before.count, after.count);
    for (let i = 0; i < before.count; i++) {
      for (let k = 0; k < before.itemSize; k++) assert.equal(before.getComponent(i, k), after.getComponent(i, k), `${name} vertex ${i}`);
    }
  }
  assert.deepEqual(a.geometry.index!.array, b.geometry.index!.array);
  assert.deepEqual(a.skeleton.boneInverses.map((matrix) => matrix.elements), b.skeleton.boneInverses.map((matrix) => matrix.elements));
  const weights = b.geometry.getAttribute('skinWeight');
  for (let i = 0; i < weights.count; i++) {
    assert.ok(Math.abs(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) - 1) < 0.00001);
  }
  first.dispose(); second.dispose();
});

test('actual rig poses are symmetric, bounded, view-independent and reset without drift', async () => {
  const source = (await asset).scene;
  const model = prepareAnatomyModel(source);
  const parent = new Group(); parent.add(model.scene);
  const rig = createWallAngelRig(model.scene);
  const original = model.meshes[0].skeleton.bones.map((bone) => bone.quaternion.clone());
  const point = new Vector3();
  for (const topAngleDeg of [120, 150]) {
    let lastWristHeight = 0;
    for (const progress of [0, 0.5, 1]) {
      rig.apply(progress, { ...wallAngelDefaults, topAngleDeg });
      const left = model.scene.getObjectByName('handL')!.getWorldPosition(new Vector3());
      const right = model.scene.getObjectByName('handR')!.getWorldPosition(new Vector3());
      assert.ok(Math.abs(left.x + right.x) < 0.003);
      assert.ok(Math.abs(left.y - right.y) < 0.003);
      assert.ok(left.y > lastWristHeight); lastWristHeight = left.y;
      const mesh = model.meshes[0];
      mesh.skeleton.update();
      for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
        mesh.getVertexPosition(i, point);
        assert.ok(point.toArray().every(Number.isFinite));
        assert.ok(Math.abs(point.x) < 0.8 && point.y > -0.01 && point.y < 2.2 && Math.abs(point.z) < 0.4);
      }
    }
  }
  rig.apply(0.5);
  const before = model.scene.getObjectByName('handL')!.getWorldPosition(new Vector3());
  parent.rotation.y = Math.PI / 2;
  rig.apply(0.5);
  const after = model.scene.getObjectByName('handL')!.getWorldPosition(new Vector3());
  before.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
  assert.ok(before.distanceTo(after) < 0.00001);
  for (let repeat = 0; repeat < 5; repeat++) { rig.apply(1); rig.reset(); }
  model.meshes[0].skeleton.bones.forEach((bone, index) => assert.deepEqual(bone.quaternion.toArray(), original[index].toArray()));
  const untouched = prepareAnatomyModel(source);
  untouched.meshes[0].skeleton.bones.forEach((bone, index) => assert.deepEqual(bone.quaternion.toArray(), original[index].toArray()));
  assert.throws(() => rig.apply(NaN));
  model.dispose(); untouched.dispose();
});

test('medial trapezius and chest origins stay anchored during the movement', async () => {
  const model = prepareAnatomyModel((await asset).scene);
  const mesh = model.meshes[0];
  const parts = mesh.geometry.getAttribute('_part_id');
  const point = new Vector3();
  model.scene.updateMatrixWorld(true);
  const anchors = new Map<number, Vector3>();
  for (let i = 0; i < parts.count; i++) {
    const part = vocabulary.parts[Math.floor((parts.getX(i) - 1) / 2)];
    if (!part || !['trapezius', 'pectoralis_major'].includes(part.muscle)) continue;
    mesh.getVertexPosition(i, point);
    if (Math.abs(point.x) < 0.03) anchors.set(i, point.clone());
  }
  assert.ok(anchors.size > 100);
  const rig = createWallAngelRig(model.scene);
  for (const progress of [0, 0.5, 1]) {
    rig.apply(progress);
    for (const [i, original] of anchors) {
      mesh.getVertexPosition(i, point);
      assert.ok(point.distanceTo(original) < 0.00001, `Torso origin moved at vertex ${i}`);
    }
  }
  model.dispose();
});

test('wall-angel focus uses represented parts and excludes lats from the preview mask', async () => {
  const model = prepareAnatomyModel((await asset).scene);
  model.setFocus('wall_angel');
  const geometry = model.meshes[0].geometry;
  const parts = geometry.getAttribute('_part_id');
  const mask = geometry.getAttribute('anatomyFocus');
  const expected = getFocusCodes('wall_angel');
  let selected = 0;
  for (let i = 0; i < parts.count; i++) {
    assert.equal(mask.getX(i), expected.has(parts.getX(i)) ? 1 : 0);
    selected += mask.getX(i);
    const part = vocabulary.parts[Math.floor((parts.getX(i) - 1) / 2)];
    if (part?.muscle === 'latissimus_dorsi') assert.equal(mask.getX(i), 0);
  }
  assert.ok(selected > 0);
  model.dispose();
});
