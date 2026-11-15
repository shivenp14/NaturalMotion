export const ASSESSMENT_METRICS = ['upper_arm_elevation', 'elbow_bend', 'forearm_direction'] as const;
export type AssessmentMetric = typeof ASSESSMENT_METRICS[number];
export type BodySide = 'left' | 'right';

/** The planner selects measurements; executable target values are derived from the rig. */
export type AssessmentSelection = {
  stepIndex: number;
  side: BodySide;
  metric: AssessmentMetric;
  toleranceDeg: number;
};
export type AssessmentCheck = AssessmentSelection & { targetDeg: number };
export type AssessmentPlan = { sequenceId: string; checks: AssessmentCheck[] };

export const assessmentCheckId = (check: Pick<AssessmentSelection, 'side' | 'metric'>) =>
  `${check.side}_${check.metric}`;
