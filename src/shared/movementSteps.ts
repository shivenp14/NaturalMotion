import type { MovementCommand, MovementStep } from './contracts';

export function getStepCommands(step: MovementStep): readonly MovementCommand[] {
  return 'parallel' in step ? step.parallel : [step];
}
