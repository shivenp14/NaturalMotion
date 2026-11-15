/** Authored rendering limits for this asset, not human ROM or treatment guidance. */
export const armLimits = {
  elevationDeg: [0, 150],
  elbowFlexionDeg: [0, 110],
  externalRotationDeg: [60, 120],
  planeDeg: [-20, 90],
  shrugDeg: [-8, 12],
  reachDeg: [-12, 18],
  forearmRotationDeg: [-60, 60],
  wristFlexionDeg: [-35, 35],
  wristDeviationDeg: [-20, 20],
} as const;
export const torsoLimits = { flexionDeg: [-15, 25], rotationDeg: [-30, 30], sideBendDeg: [-20, 20] } as const;
export const neckLimits = { flexionDeg: [-20, 25], rotationDeg: [-45, 45], sideBendDeg: [-20, 20] } as const;
export type ArmPose = { -readonly [K in keyof typeof armLimits]: number };
export type AxialPose = { -readonly [K in keyof typeof torsoLimits]: number };
export type UpperBodyPose = { left: ArmPose; right: ArmPose; torso: AxialPose; neck: AxialPose };
export type PoseGroup = keyof UpperBodyPose;

export function initialUpperBodyPose(): UpperBodyPose {
  const arm: ArmPose = {
    elevationDeg: 90, elbowFlexionDeg: 90, externalRotationDeg: 90,
    planeDeg: 0, shrugDeg: 0, reachDeg: 0, forearmRotationDeg: 0,
    wristFlexionDeg: 0, wristDeviationDeg: 0,
  };
  return {
    left: { ...arm }, right: { ...arm },
    torso: { flexionDeg: 0, rotationDeg: 0, sideBendDeg: 0 },
    neck: { flexionDeg: 0, rotationDeg: 0, sideBendDeg: 0 },
  };
}

/** Authored arms-down pose; original asset rest remains available through rig.reset(). */
export function relaxedUpperBodyPose(): UpperBodyPose {
  const pose = initialUpperBodyPose();
  for (const arm of [pose.left, pose.right]) {
    arm.elevationDeg = 0;
    arm.elbowFlexionDeg = 0;
  }
  return pose;
}

export function cloneUpperBodyPose(pose: UpperBodyPose): UpperBodyPose {
  return { left: { ...pose.left }, right: { ...pose.right }, torso: { ...pose.torso }, neck: { ...pose.neck } };
}

function within<T extends object>(values: T, limits: { [K in keyof T]: readonly [number, number] }): boolean {
  return (Object.keys(limits) as (keyof T)[]).every((key) => {
    const value = values[key];
    const [min, max] = limits[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  });
}

export function upperBodyPoseError(pose: UpperBodyPose): string | null {
  for (const arm of [pose.left, pose.right]) {
    if (!within(arm, armLimits) || arm.elevationDeg + arm.elbowFlexionDeg > 190 ||
      Math.abs(arm.wristFlexionDeg) / 35 + Math.abs(arm.wristDeviationDeg) / 20 > 1.5) {
      return 'Pose exceeds the supported arm rendering envelope.';
    }
  }
  for (const [values, limits] of [[pose.torso, torsoLimits], [pose.neck, neckLimits]] as const) {
    if (!within(values, limits)) return 'Pose exceeds the supported torso/neck rendering envelope.';
    // A convex combination budget avoids stacking every axis at its extreme. Shared linear
    // interpolation between valid endpoints therefore remains within the same envelope.
    const load = (Object.keys(limits) as (keyof AxialPose)[]).reduce((sum, key) => {
      const value = values[key];
      return sum + Math.abs(value) / (value < 0 ? -limits[key][0] : limits[key][1]);
    }, 0);
    if (load > 1.5) return 'Combined torso/neck rotation exceeds the rendering envelope.';
  }
  return null;
}

export function interpolateUpperBodyPose(from: UpperBodyPose, to: UpperBodyPose, progress: number): UpperBodyPose {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error('Invalid pose interpolation progress.');
  const result = cloneUpperBodyPose(from);
  function mix<G extends PoseGroup>(group: G) {
    for (const key of Object.keys(result[group]) as (keyof UpperBodyPose[G])[]) {
      const a = from[group][key] as number;
      const b = to[group][key] as number;
      // All members of each pose group are numeric channels.
      result[group][key] = (a + (b - a) * progress) as UpperBodyPose[G][typeof key];
    }
  }
  mix('left'); mix('right'); mix('torso'); mix('neck');
  return result;
}
