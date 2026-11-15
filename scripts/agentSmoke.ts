import { HttpAgentAdapter } from '../src/agent/HttpAgentAdapter';
import { validateAgentReturn } from '../src/agent/validateAgentReturn';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import { cueCatalog } from '../src/shared/cues';

async function main() {
  const args = process.argv.slice(2);
  const expectNoMovement = args.includes('--expect-no-movement');
  const utterance = args.filter(arg => arg !== '--expect-no-movement').join(' ') ||
    'Demonstrate one wall angel up and back using coordinated shoulder and elbow components, taking 3 seconds each way.';
  const context = { ...anatomyAgentCapabilities, currentSequence: null, cues: cueCatalog };
  const adapter = new HttpAgentAdapter({ baseUrl: process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3001',
    compositionPolicy: context.compositionPolicy });
  const result = validateAgentReturn(await adapter.respond({ utterance, catalog: context.catalog,
    currentSequence: null, cues: cueCatalog }), context);
  if (!result.ok) throw new Error(result.error);
  const sequences = result.value.actions.filter(action => action.type === 'play_sequence');
  if (expectNoMovement ? sequences.length !== 0 : sequences.length === 0) {
    throw new Error(expectNoMovement ? 'Expected no movement, but received a sequence.' : 'No movement generated; this does not prove movement generation.');
  }
  for (const action of sequences) {
    const program = compileUpperBodySequence(action.sequence);
    console.log(`Renderer accepted ${program.segments.length} groups, ${program.durationSeconds}s.`);
  }
  console.log(JSON.stringify(result.value, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Agent smoke test failed.'); process.exitCode = 1; });
