import assert from 'node:assert/strict';
import test from 'node:test';
import { planMovement } from '../server/live/planner';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { compileUpperBodySequence } from '../src/anatomy/upperBodySequence';

const group = (elevation: number, flexion: number) => ({ durationSeconds: 3, holdSeconds: 0,
  targets: (['left', 'right'] as const).flatMap(side => [
    { componentId: `${side}_shoulder_elevation`, toDeg: elevation },
    { componentId: `${side}_elbow_flexion`, toDeg: flexion },
  ]) });
const valid = { steps: [group(145, 20), group(90, 90)], message: '' };
const run = (payload: unknown) => planMovement({ ...anatomyAgentCapabilities, apiKey: 'fixture', model: 'fixture',
  fetch: async (_url, init) => {
    const request = JSON.parse(init!.body as string);
    assert.equal(request.reasoning.effort, 'low'); assert.equal(request.store, false);
    assert.equal(request.text.format.schema.properties.steps.items.properties.targets.items.anyOf.length, 6);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] });
  },
}, 'Show one wall angel.', 'One demonstration.', null, new AbortController().signal);

test('compact planner derives continuous starts and retains omitted channels', async () => {
  const result = await run(valid); assert.ok(result.sequence);
  const program = compileUpperBodySequence(result.sequence);
  assert.equal(program.segments[0].from.left.elevationDeg, 90);
  assert.equal(program.segments[1].from.left.elevationDeg, 145);
  assert.equal(program.segments[1].to.left.externalRotationDeg, 90);
  assert.equal(program.segments[1].to.left.elevationDeg, 90);
});

test('compact planner still rejects cross-joint violations, conflicting channels and invented values', async () => {
  const duplicate = structuredClone(valid); duplicate.steps[0].targets.push(duplicate.steps[0].targets[0]);
  const invented = structuredClone(valid); invented.steps[0].targets[0].componentId = 'invented';
  const injected = structuredClone(valid); Object.assign(injected.steps[0].targets[0], { fromDeg: 0 });
  const fast = structuredClone(valid); fast.steps[0].durationSeconds = 1;
  for (const invalid of [duplicate, invented, injected, fast, { steps: [group(150, 90)], message: '' },
    { steps: [group(200, 20)], message: '' }, { ...valid, actions: [{ type: 'stop_movement' }] }]) await assert.rejects(run(invalid));
});

test('compact planner explains unsupported requests without an executable sequence', async () => {
  assert.deepEqual(await run({ steps: [], message: 'That movement is outside the supported components.' }),
    { sequence: null, message: 'That movement is outside the supported components.' });
});
