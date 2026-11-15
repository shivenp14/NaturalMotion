import assert from 'node:assert/strict';
import test from 'node:test';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { availableExecutableMovements, matchExecutableRequest, validateExecutableFamily } from '../src/anatomy/executableMovements';
import { createWallAngelReference } from '../src/anatomy/upperBodySequence';
import { wallAngelDefaults } from '../src/anatomy/wallAngel';
import { capabilityConversationInstructions } from '../server/live/gemini';
import { planMovement } from '../server/live/planner';

const catalog = anatomyAgentCapabilities.catalog;
const sequence = createWallAngelReference(wallAngelDefaults, 'registered-wall');

test('offered full movements follow the existing executable channels and bounds', () => {
  assert.deepEqual(availableExecutableMovements(catalog).map(movement => movement.id), ['wall_angel']);
  assert.deepEqual(availableExecutableMovements([]), []);
  assert.deepEqual(availableExecutableMovements(catalog.filter(component => component.id !== 'left_elbow_flexion')), []);
  const wrongChannel = catalog.map(component => component.id === 'left_elbow_flexion' ? { ...component, controlledChannels: ['unknown'] } : component);
  assert.deepEqual(availableExecutableMovements(wrongChannel), []);
  assert.equal(catalog.some(component => component.id.startsWith('torso_')), false);
});

test('broad symptoms and unimplemented exercises do not become unrelated joint animations', async () => {
  for (const utterance of ['Help me relieve some of my back stiffness/pain.', 'Show me a side bend.', 'Show me a torso rotation.', 'Show me cat-cow.', 'Show a wall angel and a seated twist.']) {
    assert.equal(matchExecutableRequest(utterance, 'Wall angel', catalog, null), null);
    let contacted = false;
    const plan = await planMovement({ ...anatomyAgentCapabilities, apiKey: 'unused', model: 'unused', fetch: async () => {
      contacted = true; throw new Error('Not authorized to plan.');
    } }, utterance, 'Wall angel', null, new AbortController().signal);
    assert.equal(plan.sequence, null); assert.equal(contacted, false);
  }
});

test('named selections and contextual edits preserve existing wall-angel behavior', () => {
  assert.equal(matchExecutableRequest('Show me a wall angel.', '', catalog, null), 'wall_angel');
  assert.equal(matchExecutableRequest('Yes.', 'Wall angel', catalog, null), 'wall_angel');
  assert.equal(matchExecutableRequest('Yes.', 'Cat cow', catalog, null), null);
  assert.equal(matchExecutableRequest('Make it slower.', '', catalog, sequence), 'wall_angel');
  assert.equal(matchExecutableRequest("Let's do it without the wall.", '', catalog, sequence), 'wall_angel');
  assert.equal(matchExecutableRequest("Let's do it without the wall.", 'Wall angel', catalog, null), null);
  assert.equal(validateExecutableFamily(sequence, 'wall_angel'), null);
  assert.ok(validateExecutableFamily({ ...sequence, steps: sequence.steps.slice(0, 1) }, 'wall_angel'));
});

test('conversation inventory excludes unavailable choices and asks before a broad symptom demonstration', () => {
  const instructions = capabilityConversationInstructions(catalog);
  const inventory = JSON.parse(instructions[0].split('REGISTERED_EXECUTABLE_MOVEMENTS ')[1].split('. This server-owned')[0]);
  assert.deepEqual(inventory.map((entry: { id: string }) => entry.id), ['wall_angel']);
  assert.match(instructions.join('\n'), /wait for the user to select/);
  assert.match(instructions.join('\n'), /no registered movement fits/);
  assert.match(capabilityConversationInstructions([])[0], /REGISTERED_EXECUTABLE_MOVEMENTS \[\]/);
});
