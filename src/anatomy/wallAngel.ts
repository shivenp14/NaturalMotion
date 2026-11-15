import { MathUtils, Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three';
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
  const controlled = sides.flatMap(({ clavicle, scapula, upperarm, forearm, twist, hand }) => [clavicle, scapula, upperarm, forearm, twist, hand]);
  const restLocal = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  scene.updateWorldMatrix(true, true);
  const inverseRoot = scene.getWorldQuaternion(new Quaternion()).invert();
  const restModel = new Map(controlled.map((bone) => [bone, bone.getWorldQuaternion(new Quaternion()).premultiply(inverseRoot)]));
  const rootRotation = new Quaternion();
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
    const arm = { elevationDeg: 90 + (parameters.topAngleDeg - 90) * progress, elbowFlexionDeg: 90 - 70 * progress, externalRotationDeg: 90 };
    applyPose({ left: { ...arm }, right: { ...arm } });
  }

  function applyPose(pose: UpperBodyPose) {
    const error = upperBodyPoseError(pose);
    if (error) throw new Error(error);
    reset();
    scene.getWorldQuaternion(rootRotation);
    for (const side of sides) {
      const arm = pose[side.key];
      const elevation = MathUtils.degToRad(arm.elevationDeg);
      const flexion = MathUtils.degToRad(arm.elbowFlexionDeg);
      const progress = MathUtils.clamp((arm.elevationDeg - 90) / 55, 0, 1);
      // Scapula is a sibling of upperarm on this rig. Author its motion too,
      // while leaving pelvis/spine/neck at their original local transforms.
      rotation.setFromAxisAngle(front, side.sign * MathUtils.degToRad(3 + 8 * progress));
      desired.copy(restModel.get(side.clavicle)!).premultiply(rotation);
      setModelRotation(side.clavicle, desired);
      rotation.setFromAxisAngle(front, side.sign * MathUtils.degToRad(20 + 20 * progress));
      desired.copy(restModel.get(side.scapula)!).premultiply(rotation);
      setModelRotation(side.scapula, desired);

      upper.set(side.sign * Math.sin(elevation), -Math.cos(elevation), -0.22).normalize();
      forearm.set(side.sign * Math.sin(elevation + flexion), -Math.cos(elevation + flexion), 0).normalize();
      hinge.crossVectors(upper, forearm).normalize();
      axialRotation.setFromAxisAngle(upper, side.sign * MathUtils.degToRad(arm.externalRotationDeg - 90));
      hinge.applyQuaternion(axialRotation);
      forearm.applyQuaternion(axialRotation);
      normal.crossVectors(hinge, upper).normalize();
      setFrame(side.upperarm, hinge, upper, normal);
      // Distribute forearm roll over the elbow and distal twist instead of
      // placing the full rotation at the midpoint of the forearm.
      normal.crossVectors(hinge, forearm).normalize();
      forearmOrientation.setFromRotationMatrix(basis.makeBasis(hinge, forearm, normal));
      handNormal.copy(front).addScaledVector(forearm, -front.dot(forearm)).normalize();
      handX.crossVectors(forearm, handNormal).normalize();
      desired.setFromRotationMatrix(basis.makeBasis(handX, forearm, handNormal));
      forearmOrientation.slerp(desired, 0.5);
      setModelRotation(side.forearm, forearmOrientation);

      // Distal twist places the palms forward, with a straight wrist. Bone
      // lengths/positions and the asset's quantized geometry stay untouched.
      setFrame(side.twist, handX, forearm, handNormal);
      setFrame(side.hand, handX, forearm, handNormal);
    }
    scene.updateWorldMatrix(true, true);
  }
  applyPose(initialUpperBodyPose());
  const preparedLocal = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  reset();
  const preparationFrom = new Map(controlled.map((bone) => [bone, bone.quaternion.clone()]));
  function beginPreparation() {
    let remaining = 0;
    for (const bone of controlled) {
      preparationFrom.get(bone)!.copy(bone.quaternion);
      remaining = Math.max(remaining, bone.quaternion.clone().normalize().angleTo(preparedLocal.get(bone)!.clone().normalize()));
    }
    // A completed goalpost already matches the starting pose. Preserve the
    // smooth one-second transition when the body is actually elsewhere.
    return remaining < 0.0001 ? 0 : 1;
  }
  function prepare(progress: number) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Invalid preparation progress.');
    const eased = smoothstep(progress);
    for (const bone of controlled) bone.quaternion.copy(preparationFrom.get(bone)!).slerp(preparedLocal.get(bone)!, eased);
    scene.updateWorldMatrix(true, true);
  }
  return { apply, applyPose, beginPreparation, prepare, reset };
}
