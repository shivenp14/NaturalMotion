import type { MovementSequence } from './contracts';
import { hasOnlyKeys, isRecord } from './validation';

/** `side` is the existing right-side view; the opposite side exposes left-side regions. */
export const AVATAR_VIEWS = ['front', 'back', 'side', 'left_side'] as const;
export type AvatarView = typeof AVATAR_VIEWS[number];
export type AvatarViewPreference = AvatarView | 'auto';
export type PresentationPlan = { sequenceId: string; steps: { stepIndex: number; view: AvatarView }[] };
export const avatarViewLabels: Record<AvatarViewPreference, string> = { auto: 'Auto', front: 'Front', back: 'Back', side: 'Right side', left_side: 'Left side' };

export function isAvatarView(value: unknown): value is AvatarView {
  return AVATAR_VIEWS.includes(value as AvatarView);
}
export function isAvatarViewPreference(value: unknown): value is AvatarViewPreference {
  return value === 'auto' || isAvatarView(value);
}

/** Presentation never changes executable movement or invents camera transforms. */
export function validatePresentationPlan(input: unknown, sequence: MovementSequence): PresentationPlan | null {
  if (input === undefined || input === null) return null;
  if (!isRecord(input) || !hasOnlyKeys(input, ['sequenceId', 'steps']) || input.sequenceId !== sequence.id ||
    !Array.isArray(input.steps) || input.steps.length !== sequence.steps.length) throw new Error('View plan does not match movement.');
  const steps = input.steps.map((step, index) => {
    if (!isRecord(step) || !hasOnlyKeys(step, ['stepIndex', 'view']) || step.stepIndex !== index || !isAvatarView(step.view)) throw new Error('Unsupported avatar view.');
    return { stepIndex: index, view: step.view };
  });
  return { sequenceId: sequence.id, steps };
}

export function plannedAvatarView(plan: PresentationPlan | null, sequence: MovementSequence | null, stepIndex: number): AvatarView | undefined {
  return sequence && plan?.sequenceId === sequence.id ? plan.steps[stepIndex]?.view : undefined;
}
