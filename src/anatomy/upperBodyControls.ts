import { armLimits, torsoLimits, neckLimits, initialUpperBodyPose, type PoseGroup, type UpperBodyPose } from './upperBodyPose';

export type UpperBodyControl = {
  id: string; label: string; group: PoseGroup; channel: string;
  minimum: number; maximum: number; neutral: number; step: number;
  regions: readonly string[];
  read: (pose: UpperBodyPose) => number;
  write: (pose: UpperBodyPose, value: number) => void;
};

function control<G extends PoseGroup>(group: G, key: keyof UpperBodyPose[G], id: string, label: string,
  limits: readonly [number, number], regions: readonly string[] = []): UpperBodyControl {
  return {
    id: `${group}_${id}`, label, group, channel: `${group}.${String(key)}`,
    minimum: limits[0], maximum: limits[1], neutral: initialUpperBodyPose()[group][key] as number,
    step: 5, regions,
    read: (pose) => pose[group][key] as number,
    write: (pose, value) => { pose[group][key] = value as UpperBodyPose[G][typeof key]; },
  };
}

/** Preview capabilities only. No camera observability or measured activation is claimed. */
export const upperBodyControls: readonly UpperBodyControl[] = [
  ...(['left', 'right'] as const).flatMap((side) => [
    control(side, 'elevationDeg', 'shoulder_elevation', 'Arm elevation', armLimits.elevationDeg, ['deltoid_lateral', 'trapezius_upper']),
    control(side, 'elbowFlexionDeg', 'elbow_flexion', 'Elbow bend', armLimits.elbowFlexionDeg, ['biceps_brachii_short', 'triceps_long']),
    control(side, 'externalRotationDeg', 'shoulder_external_rotation', 'Shoulder rotation', armLimits.externalRotationDeg, ['infraspinatus', 'deltoid_posterior']),
    control(side, 'planeDeg', 'shoulder_plane', 'Arm direction · side to forward', armLimits.planeDeg, ['deltoid_anterior', 'deltoid_lateral']),
    control(side, 'shrugDeg', 'shoulder_shrug', 'Shoulder lower / shrug', armLimits.shrugDeg, ['trapezius_upper']),
    control(side, 'reachDeg', 'shoulder_reach', 'Shoulder pull back / reach', armLimits.reachDeg, ['serratus_anterior', 'trapezius_middle']),
    // Wrist/forearm geometry is supported; leave unverified educational region mappings empty.
    control(side, 'forearmRotationDeg', 'forearm_rotation', 'Forearm palm rotation', armLimits.forearmRotationDeg),
    control(side, 'wristFlexionDeg', 'wrist_flexion', 'Wrist bend', armLimits.wristFlexionDeg),
    control(side, 'wristDeviationDeg', 'wrist_deviation', 'Wrist side bend', armLimits.wristDeviationDeg),
  ]),
  ...(['torso', 'neck'] as const).flatMap((group) => {
    const limits = group === 'torso' ? torsoLimits : neckLimits;
    return [
      control(group, 'flexionDeg', 'flexion', group === 'neck' ? 'Head nod' : 'Torso forward / back', limits.flexionDeg),
      control(group, 'rotationDeg', 'rotation', group === 'neck' ? 'Head turn' : 'Torso turn', limits.rotationDeg),
      control(group, 'sideBendDeg', 'side_bend', group === 'neck' ? 'Head tilt' : 'Torso side bend', limits.sideBendDeg),
    ];
  }),
];
