import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { generateAgentReturn, parseAgentRequest } from '../server/agent';
import { createAgentServer } from '../server/http';
import { HttpAgentAdapter } from '../src/agent/HttpAgentAdapter';
import { validateAgentReturn } from '../src/agent/validateAgentReturn';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { compileUpperBodySequence, createWallAngelReference, sampleUpperBodyProgram } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';

const capabilities = anatomyAgentCapabilities;
const request = { utterance: 'Demonstrate a wall angel.', catalog: capabilities.catalog, currentSequence: null };
const sequence = createWallAngelReference(wallAngelDefaults, 'integration-wall-angel');
const providerOutput = (actions: unknown[]) => ({ status: 'completed', output: [{ type: 'message', content: [
  { type: 'output_text', text: JSON.stringify({ actions }) },
] }] });

test('real anatomy catalog crosses HTTP and client validation, then compiles and completes', async t => {
  const server = createAgentServer({ ...capabilities, apiKey: 'mock-provider', model: 'mock', fetch: async (_url, init) => {
    const body = JSON.parse(init!.body as string);
    const context = JSON.parse(body.input);
    assert.deepEqual(context.catalog, capabilities.catalog);
    assert.deepEqual(context.movementGuidance.initialPose.left, { elevationDeg: 90, elbowFlexionDeg: 90, externalRotationDeg: 90 });
    assert.equal(JSON.stringify(body.text.format.schema).includes('modify_playback'), false);
    assert.equal(JSON.stringify(body.text.format.schema).includes('replay_demonstration'), false);
    return Response.json(providerOutput([{ type: 'play_sequence', sequence }]));
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const adapter = new HttpAgentAdapter({ baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    compositionPolicy: capabilities.compositionPolicy });
  const result = validateAgentReturn(await adapter.respond(request), { ...capabilities, cues: {}, currentSequence: null });
  assert.ok(result.ok);
  const action = result.value.actions[0]; assert.equal(action.type, 'play_sequence');
  if (action.type !== 'play_sequence') return;
  const program = compileUpperBodySequence(action.sequence);
  assert.equal(program.segments.length, 2);
  const end = sampleUpperBodyProgram(program, program.durationSeconds);
  assert.equal(end.completed, true); assert.equal(end.pose.left.elevationDeg, 90);
  assert.ok(capabilities.catalog.every(component => component.supportedCheckIds.length === 0 && component.cameraView === 'unconfigured'));
});

test('renderer constraints reject structurally valid but unsupported provider movements', async () => {
  const tooFast = structuredClone(sequence); const fastStep = tooFast.steps[0];
  assert.ok('parallel' in fastStep); fastStep.durationSeconds = 1;
  const discontinuous = structuredClone(sequence); const first = discontinuous.steps[0];
  assert.ok('parallel' in first); first.parallel[0].parameters.fromDeg = 100;
  const uncoordinated = structuredClone(sequence); const top = uncoordinated.steps[0];
  assert.ok('parallel' in top);
  top.parallel = top.parallel.filter(command => !command.componentId.endsWith('elbow_flexion'));
  for (const unsupported of [tooFast, discontinuous, uncoordinated]) {
    await assert.rejects(generateAgentReturn(request, { ...capabilities, apiKey: 'mock', model: 'mock',
      fetch: async () => Response.json(providerOutput([{ type: 'play_sequence', sequence: unsupported }])) }), /failed validation/);
    assert.throws(() => parseAgentRequest({ ...request, currentSequence: unsupported }, capabilities.catalog, capabilities.compositionPolicy));
  }
});

test('configured service rejects indexed controls even if provider ignores its schema', async () => {
  await assert.rejects(generateAgentReturn({ ...request, currentSequence: sequence }, {
    ...capabilities, apiKey: 'mock', model: 'mock', fetch: async () => Response.json(providerOutput([
      { type: 'replay_demonstration', stepIndex: 0 },
    ])),
  }), /Indexed playback controls/);
});
