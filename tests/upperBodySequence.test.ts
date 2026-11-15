import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PlaybackState } from '../src/shared/contracts';
import { prepareAnatomyModel } from '../src/anatomy/prepareModel';
import { initialUpperBodyPose } from '../src/anatomy/upperBodyPose';
import { compileUpperBodySequence, createPlaybackReporter, createWallAngelReference, sampleUpperBodyProgram } from '../src/anatomy/upperBodySequence';
import { createWallAngelRig, wallAngelDefaults } from '../src/anatomy/wallAngel';

test('a wall angel compiles from reusable commands with simultaneous interpolation and holds', () => {
  const input = createWallAngelReference(wallAngelDefaults, 'reference');
  const program = compileUpperBodySequence(input);
  assert.equal(program.durationSeconds, 7);
  assert.deepEqual(sampleUpperBodyProgram(program, 0).pose, initialUpperBodyPose());
  const midpoint = sampleUpperBodyProgram(program, 1.5);
  assert.equal(midpoint.pose.left.elevationDeg, 117.5);
  assert.equal(midpoint.pose.left.elbowFlexionDeg, 55);
  assert.deepEqual(midpoint.pose.left, midpoint.pose.right);
  assert.equal(sampleUpperBodyProgram(program, 3).phase, 'holding');
  assert.equal(sampleUpperBodyProgram(program, 4).phase, 'returning');
  assert.equal(sampleUpperBodyProgram(program, 4).stepIndex, 1);
  const complete = sampleUpperBodyProgram(program, 7);
  assert.equal(complete.completed, true);
  assert.deepEqual(complete.pose, initialUpperBodyPose());
  assert.throws(() => sampleUpperBodyProgram(program, NaN));
  const slower = compileUpperBodySequence(createWallAngelReference({ ...wallAngelDefaults, travelSeconds: 5, topAngleDeg: 125 }, 'slower'));
  assert.equal(slower.durationSeconds, 11);
  assert.equal(sampleUpperBodyProgram(slower, 5).pose.left.elevationDeg, 125);
});

test('the executor accepts a different single-channel composition without an exercise identifier', () => {
  const program = compileUpperBodySequence({ id: 'left-only', steps: [{
    parallel: [{ componentId: 'left_shoulder_elevation', parameters: { fromDeg: 90, toDeg: 100 } }], durationSeconds: 2, holdSeconds: 0,
  }] });
  const pose = sampleUpperBodyProgram(program, 2).pose;
  assert.equal(pose.left.elevationDeg, 100);
  assert.equal(pose.right.elevationDeg, 90);
  assert.ok([...program.segments[0].focusCodes].every((code) => code % 2 === 1), 'Only left-side parts should be highlighted.');
});

test('the compiler rejects unknown, conflicting, discontinuous and cross-joint-invalid programs', () => {
  const group = (parallel: unknown[], extra = {}) => ({ id: 'bad', steps: [{ parallel, durationSeconds: 3, holdSeconds: 0, ...extra }] });
  const command = (id: string, fromDeg: number, toDeg: number) => ({ componentId: id, parameters: { fromDeg, toDeg } });
  assert.throws(() => compileUpperBodySequence(group([command('invented', 90, 100)])));
  assert.throws(() => compileUpperBodySequence(group([command('left_shoulder_elevation', 100, 110)])));
  assert.throws(() => compileUpperBodySequence(group([command('left_shoulder_elevation', 90, 145)])));
  assert.throws(() => compileUpperBodySequence(group([command('left_shoulder_elevation', 90, 95), command('left_shoulder_elevation', 90, 100)])));
  assert.throws(() => compileUpperBodySequence(group([command('left_elbow_flexion', 90, 20)])));
  assert.throws(() => compileUpperBodySequence(group([command('left_shoulder_elevation', 90, 100)], { durationSeconds: 1 })));
  const discontinuous = createWallAngelReference(wallAngelDefaults, 'discontinuous');
  if ('parallel' in discontinuous.steps[1]) discontinuous.steps[1].parallel[0].parameters.fromDeg -= 1;
  assert.throws(() => compileUpperBodySequence(discontinuous));
});

test('phase reports retain entry timestamps and include step changes and pause/resume', () => {
  const events: PlaybackState[] = [];
  const report = createPlaybackReporter('reference', (state) => events.push(state));
  report(0, 'preparing', 'playing', 1000);
  report(0, 'preparing', 'playing', 1010);
  report(0, 'moving', 'playing', 2000);
  report(0, 'moving', 'paused', 2100);
  report(0, 'moving', 'playing', 2200);
  report(0, 'holding', 'playing', 5000);
  report(1, 'returning', 'playing', 6000);
  report(1, 'completed', 'completed', 9000);
  report(1, 'completed', 'completed', 9010);
  assert.equal(events.length, 7);
  assert.equal(events[0].updatedAt, 1000);
  assert.equal(events[3].updatedAt, 2200);
  assert.equal(events[5].stepIndex, 1);
  assert.equal(events[6].status, 'completed');
});

test('compiled poses drive the real rig, support one-sided rotation and preserve the untouched side', async () => {
  const bytes = await readFile('assets/models/heatsy/body-smoothed.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const model = prepareAnatomyModel(gltf.scene);
  const rig = createWallAngelRig(model.scene);
  rig.prepare(1);
  const initialRight = model.scene.getObjectByName('handR')!.getWorldPosition(new Vector3());
  const initialLeft = model.scene.getObjectByName('handL')!.getWorldPosition(new Vector3());
  const independent = compileUpperBodySequence({ id: 'rotation', steps: [{ parallel: [
    { componentId: 'left_shoulder_external_rotation', parameters: { fromDeg: 90, toDeg: 100 } },
  ], durationSeconds: 3, holdSeconds: 0 }] });
  rig.applyPose(sampleUpperBodyProgram(independent, 3).pose);
  assert.ok(model.scene.getObjectByName('handL')!.getWorldPosition(new Vector3()).distanceTo(initialLeft) > 0.01);
  assert.ok(model.scene.getObjectByName('handR')!.getWorldPosition(new Vector3()).distanceTo(initialRight) < 0.00001);
  const program = compileUpperBodySequence(createWallAngelReference(wallAngelDefaults, 'reference'));
  for (const time of [0, 1.5, 3, 4, 5.5, 7]) {
    rig.applyPose(sampleUpperBodyProgram(program, time).pose);
    for (const bone of model.meshes[0].skeleton.bones) assert.ok(bone.quaternion.toArray().every(Number.isFinite));
  }
  rig.applyPose(sampleUpperBodyProgram(program, 1.5).pose);
  const beforePreparation = model.meshes[0].skeleton.bones.map((bone) => bone.quaternion.toArray());
  rig.beginPreparation(); rig.prepare(0);
  model.meshes[0].skeleton.bones.forEach((bone, i) => bone.quaternion.toArray().forEach((value, k) => assert.ok(Math.abs(value - beforePreparation[i][k]) < 0.0000001)));
  rig.prepare(1);
  assert.ok(model.scene.getObjectByName('handR')!.getWorldPosition(new Vector3()).distanceTo(initialRight) < 0.00001);
  rig.reset(); model.dispose();
});
