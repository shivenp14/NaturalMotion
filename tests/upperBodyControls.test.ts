import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Euler, Group, MathUtils, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { componentCatalog } from '../src/shared/catalog';
import { prepareAnatomyModel } from '../src/anatomy/prepareModel';
import { upperBodyControls, type UpperBodyControl } from '../src/anatomy/upperBodyControls';
import { cloneUpperBodyPose, initialUpperBodyPose, interpolateUpperBodyPose, relaxedUpperBodyPose, upperBodyPoseError } from '../src/anatomy/upperBodyPose';
import { compileUpperBodySequence, createUpperBodyPoseReference, sampleUpperBodyProgram, upperBodyPreviewCatalog } from '../src/anatomy/upperBodySequence';
import { createWallAngelRig } from '../src/anatomy/wallAngel';

function endpoint(control: UpperBodyControl, value: number) {
  const pose = initialUpperBodyPose();
  control.write(pose, value);
  if (control.group === 'left' || control.group === 'right') {
    const arm = pose[control.group];
    // Coordinate elevation and elbow flexion to stay in the existing combined envelope.
    if (arm.elevationDeg + arm.elbowFlexionDeg > 190) {
      if (control.id.endsWith('shoulder_elevation')) arm.elbowFlexionDeg = 190 - arm.elevationDeg;
      else arm.elevationDeg = 190 - arm.elbowFlexionDeg;
    }
  }
  return pose;
}

const asset = readFile('assets/models/heatsy/body-smoothed.glb').then((bytes) =>
  new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));

test('all 24 preview channels compile, interpolate, hold and return without enabling the agent catalog', () => {
  assert.equal(upperBodyControls.length, 24);
  assert.equal(new Set(upperBodyControls.map((control) => control.channel)).size, 24);
  assert.equal(componentCatalog.length, 0);
  assert.ok(upperBodyPreviewCatalog.every((component) => component.cameraView === 'unconfigured' && component.supportedCheckIds.length === 0));
  for (const control of upperBodyControls) {
    for (const value of [control.minimum, control.maximum]) {
      const pose = endpoint(control, value);
      assert.equal(upperBodyPoseError(pose), null, control.id);
      const reference = createUpperBodyPoseReference(pose, control.id);
      const program = compileUpperBodySequence(reference);
      assert.equal(control.read(sampleUpperBodyProgram(program, 3).pose), value, control.id);
      assert.equal(sampleUpperBodyProgram(program, 3).phase, 'holding');
      assert.equal(sampleUpperBodyProgram(program, 4).phase, 'returning');
      assert.deepEqual(sampleUpperBodyProgram(program, 7).pose, initialUpperBodyPose());
      for (const progress of [0, 0.1, 0.5, 0.9, 1]) {
        assert.equal(upperBodyPoseError(interpolateUpperBodyPose(initialUpperBodyPose(), pose, progress)), null);
      }
      const invalid = cloneUpperBodyPose(pose);
      control.write(invalid, value === control.minimum ? value - 1 : value + 1);
      assert.ok(upperBodyPoseError(invalid), control.id);
      control.write(invalid, NaN);
      assert.ok(upperBodyPoseError(invalid), control.id);
    }
  }
});

test('arms-down is executable and unsupported combined poses fail before rendering', () => {
  const reference = createUpperBodyPoseReference(relaxedUpperBodyPose(), 'arms-down');
  const program = compileUpperBodySequence(reference);
  assert.deepEqual(sampleUpperBodyProgram(program, 3).pose, relaxedUpperBodyPose());
  const combined = initialUpperBodyPose();
  combined.torso = { flexionDeg: 25, rotationDeg: 30, sideBendDeg: 20 };
  assert.throws(() => createUpperBodyPoseReference(combined, 'bad-torso'));
  combined.torso = initialUpperBodyPose().torso;
  combined.neck = { flexionDeg: 25, rotationDeg: 45, sideBendDeg: 20 };
  assert.throws(() => createUpperBodyPoseReference(combined, 'bad-neck'));
  combined.neck = initialUpperBodyPose().neck;
  combined.left.wristFlexionDeg = 35; combined.left.wristDeviationDeg = 20;
  assert.throws(() => createUpperBodyPoseReference(combined, 'bad-wrist'));
  const duplicate = createUpperBodyPoseReference(endpoint(upperBodyControls[3], 30), 'duplicate');
  if ('parallel' in duplicate.steps[0]) duplicate.steps[0].parallel.push(duplicate.steps[0].parallel[0]);
  assert.throws(() => compileUpperBodySequence(duplicate));
  assert.throws(() => interpolateUpperBodyPose(initialUpperBodyPose(), relaxedUpperBodyPose(), Infinity));
});

test('every endpoint changes the intended real bone while fingers and lower-body locals stay fixed', async () => {
  const model = prepareAnatomyModel((await asset).scene);
  const rig = createWallAngelRig(model.scene);
  const skeleton = model.meshes[0].skeleton;
  const rest = skeleton.bones.map((bone) => bone.quaternion.clone());
  const protectedBones = skeleton.bones.filter((bone) => /^(pelvis|thigh|shin|foot|toes|thumb|index|middle|ring|pinky)/.test(bone.name));
  const protectedPositions = new Map(protectedBones.filter((bone) => /^(pelvis|thigh|shin|foot|toes)/.test(bone.name))
    .map((bone) => [bone, bone.getWorldPosition(new Vector3())]));
  const boneFor = (control: UpperBodyControl) => {
    if (control.group === 'torso') return 'spine_03';
    if (control.group === 'neck') return 'head';
    const side = control.group === 'left' ? 'L' : 'R';
    return (control.id.includes('wrist') ? 'hand' : control.id.includes('forearm') ? 'forearm_twist' :
      control.id.includes('shrug') || control.id.includes('reach') ? 'clavicle' :
        control.id.includes('elbow') ? 'forearm' : 'upperarm') + side;
  };
  const point = new Vector3();
  for (const control of upperBodyControls) {
    rig.applyPose(initialUpperBodyPose());
    const bone = model.scene.getObjectByName(boneFor(control))!;
    const baseline = bone.getWorldQuaternion(new Quaternion());
    for (const value of [control.minimum, control.maximum]) {
      rig.applyPose(endpoint(control, value));
      assert.ok(bone.getWorldQuaternion(new Quaternion()).angleTo(baseline) > 0.01, `${control.id} did not move`);
      for (const item of skeleton.bones) {
        assert.ok(item.quaternion.toArray().every(Number.isFinite), control.id);
        assert.ok(Math.abs(item.quaternion.length() - 1) < 0.00001, `${control.id}: ${item.name}`);
      }
      for (const item of protectedBones) {
        assert.deepEqual(item.quaternion.toArray(), rest[skeleton.bones.indexOf(item)].toArray(), item.name);
      }
      for (const [item, position] of protectedPositions) assert.ok(item.getWorldPosition(point).distanceTo(position) < 1e-6, item.name);
      const mesh = model.meshes[0];
      for (let index = 0; index < mesh.geometry.getAttribute('position').count; index += 17) {
        mesh.getVertexPosition(index, point);
        assert.ok(point.toArray().every(Number.isFinite) && point.length() < 3, `${control.id}: vertex ${index}`);
      }
    }
  }
  rig.applyPose(relaxedUpperBodyPose());
  assert.ok(model.scene.getObjectByName('handL')!.getWorldPosition(point).y < 1);
  rig.reset();
  skeleton.bones.forEach((bone, index) => assert.deepEqual(bone.quaternion.toArray(), rest[index].toArray()));
  model.dispose();
});

test('torso rotation carries the arms, neck remains independent, and wrist controls stay distal', async () => {
  const model = prepareAnatomyModel((await asset).scene);
  const rig = createWallAngelRig(model.scene);
  const hand = model.scene.getObjectByName('handL')!;
  const shoulder = model.scene.getObjectByName('upperarmL')!;
  const pose = initialUpperBodyPose();
  rig.applyPose(pose);
  const initialVector = hand.getWorldPosition(new Vector3()).sub(shoulder.getWorldPosition(new Vector3()));
  pose.torso.rotationDeg = 20;
  rig.applyPose(pose);
  const movedVector = hand.getWorldPosition(new Vector3()).sub(shoulder.getWorldPosition(new Vector3()));
  initialVector.applyQuaternion(new Quaternion().setFromEuler(new Euler(0, MathUtils.degToRad(20), 0, 'YXZ')));
  assert.ok(initialVector.distanceTo(movedVector) < 1e-6);
  const before = hand.getWorldPosition(new Vector3());
  pose.neck.rotationDeg = 25;
  rig.applyPose(pose);
  assert.ok(hand.getWorldPosition(new Vector3()).distanceTo(before) < 1e-6);
  const forearm = model.scene.getObjectByName('forearmL')!;
  const forearmBefore = forearm.getWorldQuaternion(new Quaternion());
  const wristBefore = hand.getWorldQuaternion(new Quaternion());
  pose.left.wristFlexionDeg = 20;
  rig.applyPose(pose);
  assert.ok(forearmBefore.angleTo(forearm.getWorldQuaternion(new Quaternion())) < 1e-6);
  assert.ok(wristBefore.angleTo(hand.getWorldQuaternion(new Quaternion())) > 0.1);
  const localPosition = hand.getWorldPosition(new Vector3());
  const parent = new Group(); parent.add(model.scene); parent.rotation.y = Math.PI / 2;
  rig.applyPose(pose);
  localPosition.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  assert.ok(localPosition.distanceTo(hand.getWorldPosition(new Vector3())) < 1e-6);
  model.dispose();
});

test('straight elbows remain continuous near arms-down and forward-facing arm directions', async () => {
  const model = prepareAnatomyModel((await asset).scene);
  const rig = createWallAngelRig(model.scene);
  for (const planeDeg of [0, 45, 90]) {
    const pose = relaxedUpperBodyPose();
    pose.left.planeDeg = planeDeg;
    pose.right.planeDeg = planeDeg;
    rig.applyPose(pose);
    const before = ['upperarmL', 'forearmL', 'handL', 'upperarmR', 'forearmR', 'handR']
      .map((name) => model.scene.getObjectByName(name)!.getWorldQuaternion(new Quaternion()));
    pose.left.elevationDeg = pose.right.elevationDeg = 0.00001;
    rig.applyPose(pose);
    ['upperarmL', 'forearmL', 'handL', 'upperarmR', 'forearmR', 'handR'].forEach((name, index) => {
      assert.ok(before[index].angleTo(model.scene.getObjectByName(name)!.getWorldQuaternion(new Quaternion())) < 0.00001, name);
    });
  }
  model.dispose();
});
