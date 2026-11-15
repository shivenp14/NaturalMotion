import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import type { LiveServerMessage } from '../src/live/protocol';
import { LiveCompletion } from './liveCompletion';

const address = new URL(process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3001');
address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'; address.pathname = '/live';
const socket = new WebSocket(address);
let accepted = false;
let audioChunks = 0;
let finished = false;
const completion = new LiveCompletion();
const args = process.argv.slice(2);
const expectNoMovement = args.includes('--expect-no-movement');
const audioIndex = args.indexOf('--audio-pcm');
const audioPath = audioIndex >= 0 ? args[audioIndex + 1] : undefined;
if (audioIndex >= 0 && !audioPath) throw new Error('--audio-pcm requires a PCM16 little-endian, 16 kHz mono file.');
const request = args.filter((arg, index) => arg !== '--expect-no-movement' && index !== audioIndex && (audioIndex < 0 || index !== audioIndex + 1)).join(' ');
const timeout = setTimeout(() => finish('Live smoke test timed out.'), 60_000);
function finish(error?: string) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (error) { console.error(error); process.exitCode = 1; }
  else { console.log(`Live conversation + planner passed; received ${audioChunks} audio chunks. Native playback and physical-device audio still require device testing.`); }
  socket.close();
}
socket.on('open', () => socket.send(JSON.stringify({ type: 'context', sequence: null, playback: null })));
socket.on('error', () => finish('Could not reach the live backend.'));
socket.on('close', () => { if (!finished) finish('Live connection closed before acceptance.'); });
async function sendSpeech(path: string) {
  const pcm = readFileSync(path);
  if (!pcm.length || pcm.length % 2 || pcm.length > 960000) throw new Error('Expected at most 30 seconds of PCM16/16kHz/mono audio.');
  console.log('Sending recorded/synthetic PCM through the real speech + planner path; this does not test a device microphone.');
  for (let offset = 0; offset < pcm.length && !finished; offset += 3200) {
    socket.send(JSON.stringify({ type: 'audio', data: pcm.subarray(offset, offset + 3200).toString('base64') }));
    await sleep(100);
  }
  for (let index = 0; index < 15 && !finished; index++) {
    socket.send(JSON.stringify({ type: 'audio', data: Buffer.alloc(3200).toString('base64') })); await sleep(100);
  }
}
socket.on('message', data => {
  try {
    const event = JSON.parse(data.toString()) as LiveServerMessage;
    if (event.type === 'error') { finish(event.message); return; }
    if (event.type === 'ready') {
      console.log(`Connected conversation=${event.conversationModel}, planner=${event.plannerModel}`);
      if (audioPath) void sendSpeech(audioPath).catch(error => finish(error instanceof Error ? error.message : 'Audio input failed.'));
      else socket.send(JSON.stringify({ type: 'text', text: request ||
        'Please demonstrate one wall angel up and back, slowly, and finish in a goalpost position.' }));
    }
    if (event.type === 'audio') audioChunks++;
    if (event.type === 'action') {
      if (expectNoMovement && event.action.type === 'play_sequence') { finish('Unexpected movement in a no-movement test.'); return; }
      if (event.action.type !== 'play_sequence') { socket.send(JSON.stringify({ type: 'applied', commandId: event.commandId, ok: false })); return; }
      const program = compileUpperBodySequence(event.action.sequence);
      console.log(`Renderer compiler accepted ${program.segments.length} groups, ${program.durationSeconds}s. Host protocol test acknowledges acceptance; no body is rendered by this script.`);
      accepted = true;
      socket.send(JSON.stringify({ type: 'applied', commandId: event.commandId, ok: true }));
    }
    if (completion.update(event) && (accepted || expectNoMovement)) finish();
  } catch { finish('Live response or generated movement failed validation.'); }
});
