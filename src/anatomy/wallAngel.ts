import { Euler, MathUtils, Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three';
import { initialUpperBodyPose, upperBodyPoseError, type UpperBodyPose } from './upperBodyPose';

/** Rendering limits for this authored preview, not prescribed human ROM. */
export type WallAngelParameters = {
  topAngleDeg: number;
  travelSeconds: number;
  holdSeconds: number;
};

export const wallAngelDefaults: Readonly<WallAngelParameters> = {
  topAngleDeg: 145,
  travelSeconds: 3,
  holdSeconds: 1,
};

export type WallAngelPreview = {
  mode: 'rest' | 'goalpost' | 'midpoint' | 'top' | 'playing' | 'paused' | 'completed';
  parameters: WallAngelParameters;
};

export function validateWallAngelParameters(parameters: WallAngelParameters) {
  const limits = { topAngleDeg: [120, 150], travelSeconds: [2, 5], holdSeconds: [0, 2] };
  for (const key of Object.keys(limits) as (keyof WallAngelParameters)[]) {
    const value = parameters[key];
    const [minimum, maximum] = limits[key];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new Error(`Invalid wall-angel preview parameter: ${key}.`);
    }
  }
}

const smoothstep = (value: number) => value * value * (3 - 2 * value);

/** One cycle, with a smooth start/stop at the goalpost and upper endpoint. */
export function sampleWallAngelCycle(elapsedSeconds: number, parameters: WallAngelParameters) {
  validateWallAngelParameters(parameters);
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid wall-angel preview time.');
  const { travelSeconds: travel, holdSeconds: hold } = parameters;
  if (elapsedSeconds < travel) return { progress: smoothstep(elapsedSeconds / travel), phase: 'moving' as const, completed: false };
  if (elapsedSeconds < travel + hold) return { progress: 1, phase: 'holding' as const, completed: false };
  if (elapsedSeconds < 2 * travel + hold) {
    return { progress: 1 - smoothstep((elapsedSeconds - travel - hold) / travel), phase: 'returning' as const, completed: false };
  }
  return { progress: 0, phase: 'completed' as const, completed: true };
}

/**
 * Authored kinematic pose for this asset. No muscle simulation, IK contact
 * solver or clinically validated scapulohumeral rhythm is implied.
 */
export function createWallAngelRig(scene: Object3D) {
  const bones = new Map<string, Bone>();
  scene.traverse((object) => { if ((object as Bone).isBone) bones.set(object.name, object as Bone); });
  function requireBone(name: string) {
    const bone = bones.get(name);
    if (!bone) throw new Error(`Wall-angel preview requires bone ${name}.`);
    return bone;
  }
  const sides = (['L', 'R'] as const).map((side) => ({
    key: side === 'L' ? 'left' as const : 'right' as const,
    sign: side === 'L' ? 1 : -1,
    clavicle: requireBone(`clavicle${side}`),
    scapula: requireBone(`scapula${side}`),
    upperarm: requireBone(`upperarm${side}`),
    forearm: requireBone(`forearm${side}`),
    twist: requireBone(`forearm_twist${side}`),
    hand: requireBone(`hand${side}`),
  }));
  const spine = ['spine_01', 'spine_02', 'spine_03'].map(requireBone);
  const neck = requireBone('neck');
  const head = requireBone('head');
  const controlled = [...spine, neck, head, ...sides.flatMap(({ clavicle, scapula, upperarm, forearm, twist, hand }) => [clavicle, scapula, upperarm, forearm, twist, hand])];
  const restLocal = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  scene.updateWorldMatrix(true, true);
  const inverseRoot = scene.getWorldQuaternion(new Quaternion()).invert();
  const restModel = new Map(controlled.map((bone) => [bone, bone.getWorldQuaternion(new Quaternion()).premultiply(inverseRoot)]));
  const rootRotation = new Quaternion();
  const sceneRotation = new Quaternion();
  const torsoRotation = new Quaternion();
  const girdleRotation = new Quaternion();
  const planeRotation = new Quaternion();
  const rollRotation = new Quaternion();
  const wristRotation = new Quaternion();
  const angles = new Euler(0, 0, 0, 'YXZ');
  const up = new Vector3(0, 1, 0);
  const palmReference = new Vector3();
  const parentInverse = new Quaternion();
  const desired = new Quaternion();
  const forearmOrientation = new Quaternion();
  const rotation = new Quaternion();
  const basis = new Matrix4();
  const upper = new Vector3();
  const forearm = new Vector3();
  const hinge = new Vector3();
  const normal = new Vector3();
  const handX = new Vector3();
  const front = new Vector3(0, 0, 1);
  const handNormal = new Vector3();
  const axialRotation = new Quaternion();

  function setModelRotation(bone: Bone, orientation: Quaternion) {
    bone.parent!.updateWorldMatrix(true, false);
    bone.parent!.getWorldQuaternion(parentInverse).invert();
    bone.quaternion.copy(parentInverse).multiply(rootRotation).multiply(orientation);
    bone.updateWorldMatrix(false, false);
  }

  function setFrame(bone: Bone, x: Vector3, y: Vector3, z: Vector3) {
    desired.setFromRotationMatrix(basis.makeBasis(x, y, z));
    setModelRotation(bone, desired);
  }

  function reset() {
    for (const bone of controlled) bone.quaternion.copy(restLocal.get(bone)!);
    scene.updateWorldMatrix(true, true);
  }

  function apply(progress: number, parameters: WallAngelParameters = wallAngelDefaults) {
    validateWallAngelParameters(parameters);
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Invalid wall-angel pose progress.');
    const arm = { ...initialUpperBodyPose().left, elevationDeg: 90 + (parameters.topAngleDeg - 90) * progress, elbowFlexionDeg: 90 - 70 * progress, externalRotationDeg: 90 };
    applyPose({ ...initialUpperBodyPose(), left: { ...arm }, right: { ...arm } });
  }

  function applyPose(pose: UpperBodyPose) {
    const error = upperBodyPoseError(pose);
    if (error) throw new Error(error);
    reset();
    scene.getWorldQuaternion(sceneRotation);
    rootRotation.copy(sceneRotation);
    // Cumulative model-space rotations distribute torso movement across the three spine
    // segments. Pelvis and lower-body locals are never written.
    for (let index = 0; index < spine.length; index++) {
      const fraction = [0.2, 0.55, 1][index];
      angles.set(MathUtils.degToRad(pose.torso.flexionDeg * fraction), MathUtils.degToRad(pose.torso.rotationDeg * fraction), -MathUtils.degToRad(pose.torso.sideBendDeg * fraction), 'YXZ');
      torsoRotation.setFromEuler(angles);
      desired.copy(restModel.get(spine[index])!).premultiply(torsoRotation);
      setModelRotation(spine[index], desired);
    }
    rootRotation.copy(sceneRotation).multiply(torsoRotation);
    for (const [bone, fraction] of [[neck, 0.6], [head, 1]] as const) {
      angles.set(MathUtils.degToRad(pose.neck.flexionDeg * fraction), MathUtils.degToRad(pose.neck.rotationDeg * fraction), -MathUtils.degToRad(pose.neck.sideBendDeg * fraction), 'YXZ');
      rotation.setFromEuler(angles);
      desired.copy(restModel.get(bone)!).premultiply(rotation);
      setModelRotation(bone, desired);
    }
    for (const side of sides) {
      const arm = pose[side.key];
      const elevation = MathUtils.degToRad(arm.elevationDeg);
      const flexion = MathUtils.degToRad(arm.elbowFlexionDeg);
      const progress = MathUtils.clamp((arm.elevationDeg - 90) / 55, 0, 1);
      // One coordinator owns girdle and arm rotations. Independent shrug/reach offsets
      // augment automatic clavicle/scapula motion rather than competing for bone writes.
      angles.set(0, -side.sign * MathUtils.degToRad(arm.reachDeg), side.sign * MathUtils.degToRad(arm.shrugDeg), 'YXZ');
      girdleRotation.setFromEuler(angles);
      rootRotation.copy(sceneRotation).multiply(torsoRotation).multiply(girdleRotation);
      const raised = Math.min(arm.elevationDeg / 90, 1);
      rotation.setFromAxisAngle(front, side.sign * MathUtils.degToRad((3 + 8 * progress) * raised));
      desired.copy(restModel.get(side.clavicle)!).premultiply(rotation);
      setModelRotation(side.clavicle, desired);
      rotation.setFromAxisAngle(front, side.sign * MathUtils.degToRad((20 + 20 * progress) * raised));
      desired.copy(restModel.get(side.scapula)!).premultiply(rotation);
      setModelRotation(side.scapula, desired);

      upper.set(side.sign * Math.sin(elevation), -Math.cos(elevation), -0.22 * raised).normalize();
      // Define the hinge from the arm's reference plane, not from a cross product of two
      // nearly parallel limbs. Straightening the elbow must not suddenly roll the arm.
      hinge.copy(front).addScaledVector(upper, -front.dot(upper)).normalize().multiplyScalar(side.sign);
      forearm.copy(upper).applyAxisAngle(hinge, flexion);
      axialRotation.setFromAxisAngle(upper, side.sign * MathUtils.degToRad(arm.externalRotationDeg - 90));
      hinge.applyQuaternion(axialRotation);
      forearm.applyQuaternion(axialRotation);
      planeRotation.setFromAxisAngle(up, -side.sign * MathUtils.degToRad(arm.planeDeg));
      upper.applyQuaternion(planeRotation);
      forearm.applyQuaternion(planeRotation);
      hinge.applyQuaternion(planeRotation);
      normal.crossVectors(hinge, upper).normalize();
      setFrame(side.upperarm, hinge, upper, normal);
      // Distribute forearm roll over the elbow and distal twist instead of
      // placing the full rotation at the midpoint of the forearm.
      normal.crossVectors(hinge, forearm).normalize();
      forearmOrientation.setFromRotationMatrix(basis.makeBasis(hinge, forearm, normal));
      palmReference.copy(front).applyQuaternion(planeRotation);
      handNormal.copy(palmReference).addScaledVector(forearm, -palmReference.dot(forearm));
      if (handNormal.lengthSq() < 1e-10) handNormal.copy(normal);
      handNormal.normalize();
      handX.crossVectors(forearm, handNormal).normalize();
      desired.setFromRotationMatrix(basis.makeBasis(handX, forearm, handNormal));
      forearmOrientation.slerp(desired, 0.5);
      // Independent forearm roll is split over proximal and distal bones.
      rollRotation.setFromAxisAngle(forearm, side.sign * MathUtils.degToRad(arm.forearmRotationDeg) * 0.5);
      forearmOrientation.premultiply(rollRotation);
      setModelRotation(side.forearm, forearmOrientation);
      rollRotation.setFromAxisAngle(forearm, side.sign * MathUtils.degToRad(arm.forearmRotationDeg));
      handNormal.applyQuaternion(rollRotation);
      handX.applyQuaternion(rollRotation);

      // Distal twist places the palms forward, with a straight wrist. Bone
      // lengths/positions and the asset's quantized geometry stay untouched.
      setFrame(side.twist, handX, forearm, handNormal);
      setFrame(side.hand, handX, forearm, handNormal);
      angles.set(MathUtils.degToRad(arm.wristFlexionDeg), 0, side.sign * MathUtils.degToRad(arm.wristDeviationDeg), 'XYZ');
      wristRotation.setFromEuler(angles);
      side.hand.quaternion.multiply(wristRotation);
    }
    scene.updateWorldMatrix(true, true);
  }
  applyPose(initialUpperBodyPose());
  const preparedLocal = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  reset();
  const preparationFrom = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  function beginPreparation() {
    for (const bone of controlled) preparationFrom.get(bone)!.copy(bone.quaternion);
  }
  function prepare(progress: number) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Invalid preparation progress.');
    const eased = smoothstep(progress);
    for (const bone of controlled) bone.quaternion.copy(preparationFrom.get(bone)!).slerp(preparedLocal.get(bone)!, eased);
    scene.updateWorldMatrix(true, true);
  }
  return { apply, applyPose, beginPreparation, prepare, reset };
}
