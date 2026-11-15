import { writeFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import type { LiveServerMessage } from '../src/live/protocol';

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const endpoints = args.includes('--baseline') ? [
  { label: 'before', url: option('--baseline') },
  { label: 'after', url: process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3002' },
] : [{ label: 'after', url: process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3002' }];
const prompts = [
  'Please show one wall angel, then finish at goalpost.',
  'Demonstrate a small, slow wall angel and return to goalpost.',
  'Please show one wall angel, then finish at goalpost.',
  'Explain what a wall angel is in one sentence. Do not demonstrate or change any movement.',
];
type Measurement = { label: string; sample: number; kind: string; firstAudioMs?: number;
  planningStartedMs?: number; actionMs?: number; plannerMs?: number; groups?: number;
  completedMs?: number; preActionSpeech: string; error?: string };
const results: Measurement[] = [];
async function main() {
  for (let index = 0; index < prompts.length; index++) {
    for (const endpoint of endpoints) {
      const result: Measurement = { label: endpoint.label, sample: index + 1,
        kind: index === 3 ? 'explanation' : 'movement', preActionSpeech: '' };
      await new Promise<void>(resolve => {
        const address = new URL(endpoint.url); address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'; address.pathname = '/live';
        const socket = new WebSocket(address); let sent = 0; let finished = false;
        const finish = (error?: string) => {
          if (finished) return; finished = true; clearTimeout(timeout);
          if (error) { result.error = error; process.exitCode = 1; }
          console.log(JSON.stringify(result)); results.push(result); socket.close(); resolve();
        };
        const timeout = setTimeout(() => finish('Timed out.'), 60_000);
        socket.on('open', () => socket.send(JSON.stringify({ type: 'context', sequence: null, playback: null })));
        socket.on('close', () => finish('Closed before completion.'));
        socket.on('error', () => finish('Connection failed.'));
        socket.on('message', raw => {
          try {
            const event = JSON.parse(raw.toString()) as LiveServerMessage;
            if (event.type === 'ready') { sent = performance.now(); socket.send(JSON.stringify({ type: 'text', text: prompts[index] })); return; }
            if (!sent || finished) return;
            const elapsed = Math.round(performance.now() - sent);
            if (event.type === 'planning' && event.active && result.planningStartedMs === undefined) result.planningStartedMs = elapsed;
            if (event.type === 'audio' && result.firstAudioMs === undefined) result.firstAudioMs = elapsed;
            if (event.type === 'transcript' && event.role === 'assistant' && result.actionMs === undefined) result.preActionSpeech += event.text;
            if (event.type === 'action') {
              if (index === 3 || event.action.type !== 'play_sequence') throw new Error('Unexpected movement action.');
              const program = compileUpperBodySequence(event.action.sequence);
              if (result.actionMs !== undefined) throw new Error('Duplicate execution.');
              result.actionMs = elapsed; result.groups = program.segments.length;
              result.plannerMs = elapsed - (result.planningStartedMs ?? elapsed);
              socket.send(JSON.stringify({ type: 'applied', commandId: event.commandId, ok: true }));
            }
            if (event.type === 'error') finish(event.message);
            if (event.type === 'turn_complete' && (result.actionMs !== undefined || index === 3) && result.firstAudioMs !== undefined) {
              result.completedMs = elapsed; finish();
            }
          } catch (error) { finish(error instanceof Error ? error.message : 'Invalid response.'); }
        });
      });
    }
  }
  if (args.includes('--out')) await writeFile(option('--out'), `${JSON.stringify(results, null, 2)}\n`);
  console.log('Typed-input timings; host acceptance only. Excludes speech endpoint detection, native rendering and audible playback.');
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Latency test failed.'); process.exitCode = 1; });
