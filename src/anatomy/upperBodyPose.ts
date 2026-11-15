export type ArmPose = {
  elevationDeg: number;
  elbowFlexionDeg: number;
  externalRotationDeg: number;
};
export type UpperBodyPose = { left: ArmPose; right: ArmPose };

/** Calibrated rendering envelope, not human ROM or treatment guidance. */
export function initialUpperBodyPose(): UpperBodyPose {
  return {
    left: { elevationDeg: 90, elbowFlexionDeg: 90, externalRotationDeg: 90 },
    right: { elevationDeg: 90, elbowFlexionDeg: 90, externalRotationDeg: 90 },
  };
}

export function upperBodyPoseError(pose: UpperBodyPose): string | null {
  for (const arm of [pose.left, pose.right]) {
    if (!Object.values(arm).every(Number.isFinite) ||
      arm.elevationDeg < 90 || arm.elevationDeg > 150 ||
      arm.elbowFlexionDeg < 20 || arm.elbowFlexionDeg > 90 ||
      arm.externalRotationDeg < 80 || arm.externalRotationDeg > 100 ||
      arm.elevationDeg + arm.elbowFlexionDeg < 140 || arm.elevationDeg + arm.elbowFlexionDeg > 190) {
      return 'Pose exceeds the supported upper-body rendering envelope.';
    }
  }
  return null;
}

export function interpolateUpperBodyPose(from: UpperBodyPose, to: UpperBodyPose, progress: number): UpperBodyPose {
  const mix = (a: number, b: number) => a + (b - a) * progress;
  const arm = (side: 'left' | 'right'): ArmPose => ({
    elevationDeg: mix(from[side].elevationDeg, to[side].elevationDeg),
    elbowFlexionDeg: mix(from[side].elbowFlexionDeg, to[side].elbowFlexionDeg),
    externalRotationDeg: mix(from[side].externalRotationDeg, to[side].externalRotationDeg),
  });
  return { left: arm('left'), right: arm('right') };
}
