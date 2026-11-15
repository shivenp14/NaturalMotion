import type { ComponentDefinition, MovementSequence } from '../shared/contracts';
import { compileUpperBodySequence } from './upperBodySequence';

export type ExecutableMovementId = 'wall_angel';
export type ExecutableMovement = { id: ExecutableMovementId; label: string; description: string; assessment: string };
const axes = [
  { id: 'shoulder_elevation', channel: 'elevationDeg', values: [90, 140] },
  { id: 'elbow_flexion', channel: 'elbowFlexionDeg', values: [40, 90] },
  { id: 'shoulder_external_rotation', channel: 'externalRotationDeg', values: [90] },
];

/** Full movement availability is narrower than the set of independently executable joints. */
export function availableExecutableMovements(catalog: readonly ComponentDefinition[]): ExecutableMovement[] {
  const connected = (['left', 'right'] as const).every(side => axes.every(axis => {
    const component = catalog.find(entry => entry.id === `${side}_${axis.id}`);
    return component?.controlledChannels?.length === 1 && component.controlledChannels[0] === `${side}.${axis.channel}` &&
      ['fromDeg', 'toDeg'].every(key => component.parameters[key] && axis.values.every(value =>
        value >= component.parameters[key].minimum && value <= component.parameters[key].maximum));
  }));
  return connected ? [{ id: 'wall_angel', label: 'Wall angel',
    description: 'A coordinated goalpost-to-overhead arm illustration and return. A wall-free arm illustration is supported; wall contact is not assessed.',
    assessment: 'Selected upper-arm elevation, elbow bend and forearm direction, with visible shoulders, elbows, wrists and hips.' }] : [];
}
export function availableMovementContext(catalog: readonly ComponentDefinition[]): string {
  return JSON.stringify(availableExecutableMovements(catalog));
}
const name = /\bwall[ _-]?angels?\b|\bwall[ -]free(?:\s+arm)?\s+(?:angel|illustration|variation)\b|\bgoalpost\s+(?:arm\s+)?(?:movement|demonstration|illustration)\b/i;
const unsupported = /\b(?:side[ -]?bend|lateral flexion|cat[ -]?cow|child'?s? pose|cobra|downward dog|torso (?:rotation|twist)|spinal twist|seated twist|forward fold|hamstring stretch|neck roll|hip flexor|squat|lunge|push[ -]?up|plank)\b/i;

/** A symptom is not permission to invent an exercise or substitute unrelated joint commands. */
export function matchExecutableRequest(utterance: string, interpretation: string, catalog: readonly ComponentDefinition[], current: MovementSequence | null): ExecutableMovementId | null {
  if (!availableExecutableMovements(catalog).length || unsupported.test(utterance)) return null;
  if (name.test(utterance)) return 'wall_angel';
  // Spoken agreement often contains fillers and combined clauses, rather than
  // the exact one-word answers accepted by the original selection gate.
  const selection = utterance.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  const affirmative = /\b(?:yes|yeah|yep|sure|okay|ok|go ahead|let's|lets)\b/.test(selection);
  const demonstration = /\b(?:show|demonstrate|try|do)\b/.test(selection) && /\b(?:me|it|that|one)\b/.test(selection);
  const decliningOrQuestioning = /\b(?:no|not|don't|dont|do not|can't|cannot|won't|wait|stop|why|what|explain|before|later|tomorrow)\b/.test(selection);
  if (!decliningOrQuestioning && (affirmative || demonstration) && name.test(interpretation) && !unsupported.test(interpretation)) return 'wall_angel';
  if (current && /\b(?:slower|faster|less range|smaller|gentler|more slowly|speed|range|without (?:a |the )?wall|wall[ -]free)\b/i.test(utterance) &&
    validateExecutableFamily(current, 'wall_angel') === null) return 'wall_angel';
  return null;
}

/** Family validation prevents an unrelated exercise from being relabelled as a valid arm animation. */
export function validateExecutableFamily(sequence: MovementSequence, _family: ExecutableMovementId): string | null {
  const program = compileUpperBodySequence(sequence);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  const end = program.segments.at(-1)!.to;
  return [end.left, end.right].every(arm => near(arm.elevationDeg, 90) && near(arm.elbowFlexionDeg, 90)) &&
    program.segments.some(segment => segment.to.left.elevationDeg > 100 || segment.to.right.elevationDeg > 100)
    ? null : 'The plan is not a complete supported wall-angel arm movement and return.';
}
