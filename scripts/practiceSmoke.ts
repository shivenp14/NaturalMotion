import { WebSocket } from 'ws';
import type { MovementSequence } from '../src/shared/contracts';
import type { LiveServerMessage } from '../src/live/protocol';
import type { PracticeAttempt, PracticeReview } from '../src/shared/practice';
import { compileUpperBodySequence } from '../src/anatomy/upperBodySequence';
import { validateAssessmentPlan } from '../src/vision/assessmentPlan';
import { syntheticPracticeAttempt } from '../tests/fixtures/practiceAttempt';
import { LiveCompletion } from './liveCompletion';

// Actual providers with text input, synthetic pose evidence and host-authored completion context.
// No avatar is rendered and no human or microphone recognition is verified.
const address = new URL(process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3002');
address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'; address.pathname = '/live';
const socket = new WebSocket(address);
type Stage = 'demo' | 'invitation' | 'record_bad' | 'finish_bad' | 'review_bad' | 'start_good' | 'record_good' | 'finish_good' | 'review_good';
let stage: Stage = 'demo'; let sequence: MovementSequence | null = null;
let completion = new LiveCompletion(); let review: PracticeReview | null = null; let transcript = '';
let finished = false; let movements = 0; let starts = 0; let finishes = 0;
let captured: PracticeAttempt | null = null;
const timers: ReturnType<typeof setTimeout>[] = [];
const send = (value: unknown) => socket.send(JSON.stringify(value));
function finish(error?: string) {
  if (finished) return; finished = true; timers.forEach(clearTimeout);
  if (error) { console.error(error); process.exitCode = 1; }
  else console.log(`PASS: ${movements} generated movement, ${starts} retry start, ${finishes} natural completion phrases via text, quiet recording, one correction then positive improvement feedback. Synthetic evidence; real phone quality remains unverified.`);
  socket.close();
}
timers.push(setTimeout(() => finish(`Timed out in ${stage}.`), 60000));
socket.on('open', () => send({ type: 'context', sequence: null, playback: null }));
socket.on('error', () => finish('Could not reach the backend.'));
socket.on('close', () => { if (!finished) finish('Connection closed unexpectedly.'); });
function context(practiceStage: string, startedAt: number | null) {
  send({ type: 'context', sequence, playback: { sequenceId: sequence!.id, stepIndex: sequence!.steps.length - 1,
    phase: 'completed', status: 'completed', updatedAt: Date.now() }, practiceStage, practiceStartedAt: startedAt });
}
function beginRecording(bad: boolean) {
  stage = bad ? 'record_bad' : 'record_good'; completion = new LiveCompletion();
  const startedAt = Date.now(); context('performing', startedAt);
  timers.push(setTimeout(() => {
    if (finished) return;
    captured = syntheticPracticeAttempt(sequence!, startedAt, bad ? 'provider-bad' : 'provider-good');
    if (bad) for (const row of captured.samples) row.measurements.left_elbow_bend = Math.max(0, row.measurements.left_elbow_bend! - 45);
    stage = bad ? 'finish_bad' : 'finish_good'; completion = new LiveCompletion();
    send({ type: 'text', text: bad ? "I'm done." : "I've finished doing it." });
  }, 3600));
}
socket.on('message', data => {
  if (finished) return;
  try {
    const event = JSON.parse(data.toString()) as LiveServerMessage;
    if (event.type === 'error') { finish(event.message); return; }
    if (event.type === 'ready') { send({ type: 'text', text: 'Show me how to do a wall angel.' }); return; }
    if ((stage === 'record_bad' || stage === 'record_good') && (event.type === 'audio' || (event.type === 'transcript' && event.role === 'assistant'))) {
      finish('Unexpected spoken feedback while the person is still performing.'); return;
    }
    if (event.type === 'transcript' && event.role === 'assistant') transcript += event.text;
    if (event.type === 'practice_review') { completion = new LiveCompletion(); transcript = ''; review = event.review; console.log(`${stage}: ${review.status} · ${review.message}`); }
    if (event.type === 'action') {
      if (stage === 'demo' && event.action.type === 'play_sequence') {
        sequence = event.action.sequence;
        const program = compileUpperBodySequence(sequence);
        console.log(`Guide groups: ${program.segments.map(segment => `${segment.from.left.elevationDeg}/${segment.from.left.elbowFlexionDeg}→${segment.to.left.elevationDeg}/${segment.to.left.elbowFlexionDeg}`).join(', ')}.`);
        const plan = validateAssessmentPlan(event.action.assessmentPlan, sequence);
        if (!plan?.checks.some(check => check.side === 'left' && check.metric === 'elbow_bend')) throw new Error('Planner omitted the elbow check needed for this regression.');
        movements++; send({ type: 'applied', commandId: event.commandId, ok: true }); return;
      }
      if (stage === 'start_good' && event.action.type === 'start_practice') {
        starts++; beginRecording(false);
        send({ type: 'applied', commandId: event.commandId, ok: true }); return;
      }
      if ((stage === 'finish_bad' || stage === 'finish_good') && event.action.type === 'finish_practice') {
        const bad = stage === 'finish_bad'; finishes++;
        stage = bad ? 'review_bad' : 'review_good'; completion = new LiveCompletion(); review = null; transcript = '';
        context('review', captured!.startedAt); send({ type: 'practice_attempt', attempt: captured });
        send({ type: 'applied', commandId: event.commandId, ok: true }); return;
      }
      finish(`Unexpected ${event.action.type} during ${stage}; practice must not generate another movement.`); return;
    }
    if ((stage === 'review_bad' || stage === 'review_good') && !review) return;
    if (!completion.update(event)) return;
    if (stage === 'demo' && sequence) {
      console.log('Provider movement accepted. Host now sends explicit renderer-completion context; no body is rendered.');
      stage = 'invitation'; completion = new LiveCompletion(); context('performing', Date.now());
    } else if (stage === 'invitation') {
      beginRecording(true);
    } else if (stage === 'review_bad') {
      if (review?.status !== 'needs_adjustment') throw new Error('Expected one retrospective elbow correction.');
      stage = 'start_good'; completion = new LiveCompletion(); send({ type: 'text', text: 'I am ready to try it again.' });
    } else if (stage === 'review_good') {
      if (review?.status !== 'aligned' || !/good|better|matched/i.test(transcript)) throw new Error('Expected positive feedback after the corrected repetition.');
      finish();
    }
  } catch (error) { finish(error instanceof Error ? error.message : 'Invalid practice protocol response.'); }
});
