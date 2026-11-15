import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { LiveServerMessage as GeminiMessage } from '@google/genai';
import type { AgentServiceOptions } from '../agent';
import { validateSequence } from '../../src/shared/validateSequence';
import { hasOnlyKeys, isRecord } from '../../src/shared/validation';
import type { LiveAction, LiveServerMessage } from '../../src/live/protocol';
import type { PlaybackState } from '../../src/shared/contracts';
import { deriveFormPlan, formMessage } from '../../src/vision/checks/registry';
import { planMovement } from './planner';
import { geminiConnector, type ConnectConversation, type ConversationConnection } from './gemini';
import { ToolController } from './ToolController';

export type LiveServerOptions = AgentServiceOptions & {
  geminiApiKey: string; conversationModel: string; geminiApiVersion?: string;
  /** Provider transport injection for protocol tests; never a configured production stand-in. */
  connectConversation?: ConnectConversation;
};
const base64 = (value: unknown, maximum: number): value is string => typeof value === 'string' &&
  value.length > 0 && value.length <= maximum && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);

export function attachLiveServer(server: Server, options: LiveServerOptions) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 512_000 });
  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/live' || sockets.clients.size >= 2) { socket.destroy(); return; }
    sockets.handleUpgrade(request, socket, head, client => sockets.emit('connection', client, request));
  });
  server.on('close', () => { for (const client of sockets.clients) client.close(); sockets.close(); });
  sockets.on('connection', client => {
    let closed = false;
    let provider: ConversationConnection | null = null;
    let playback: PlaybackState | null = null;
    let practiceStartedAt: number | null = null;
    let lastImage = 0;
    let lastForm = '';
    let lastFormAt = 0;
    let initialized = false;
    let messageWindow = Date.now();
    let messageCount = 0;
    const pending = new Map<string, { finish(ok: boolean): void }>();
    const send = (message: LiveServerMessage) => {
      if (closed || client.readyState !== WebSocket.OPEN) return;
      if (client.bufferedAmount > 1_000_000) { close('Connection is too slow. Restart the live session.'); return; }
      client.send(JSON.stringify(message));
    };
    const close = (message?: string) => {
      if (closed) return;
      if (message && client.readyState === WebSocket.OPEN && client.bufferedAmount <= 1_000_000) client.send(JSON.stringify({ type: 'error', message }));
      closed = true; clearTimeout(lifetime); clearTimeout(startTimeout);
      tools.close(); for (const entry of pending.values()) entry.finish(false); pending.clear();
      provider?.close(); provider = null;
      client.close();
    };
    const tools = new ToolController({
      plan: (utterance, interpretation, current, signal) => {
        if (!options.apiKey) throw new Error('Movement planner is not configured.');
        return planMovement(options, utterance, interpretation, current, signal);
      },
      onPlanning: active => send({ type: 'planning', active }),
      apply: (action: LiveAction, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
        if (signal.aborted || closed || pending.size >= 4) { reject(new Error('Session action unavailable.')); return; }
        const commandId = randomUUID();
        const timer = setTimeout(() => cancel(), 5000);
        const cancel = () => { send({ type: 'cancel', commandId }); finish(false); };
        const finish = (ok: boolean) => {
          if (!pending.delete(commandId)) return;
          clearTimeout(timer); signal.removeEventListener('abort', cancel);
          if (ok && !signal.aborted && !closed) resolve(); else reject(new Error('App did not accept the action.'));
        };
        pending.set(commandId, { finish }); signal.addEventListener('abort', cancel, { once: true });
        send({ type: 'action', commandId, action, expiresAt: Date.now() + 5000 });
      }),
    });
    const lifetime = setTimeout(() => close('Live session ended after ten minutes. Start a new session.'), 600_000);
    const startTimeout = setTimeout(() => close('Live session initialization timed out.'), 10_000);

    function receiveProvider(message: GeminiMessage) {
      if (closed) return;
      try {
        const content = message.serverContent;
        if (content?.interrupted) { tools.interrupt(); send({ type: 'interrupted' }); }
        if (message.voiceActivity?.voiceActivityType === 'ACTIVITY_START') tools.beginSpeech();
        if (message.voiceActivity?.voiceActivityType === 'ACTIVITY_END') tools.endSpeech();
        if (content?.inputTranscription?.text) {
          tools.noteInput(content.inputTranscription.text, content.inputTranscription.finished);
          send({ type: 'transcript', role: 'user', text: content.inputTranscription.text });
        }
        if (content?.outputTranscription?.text) send({ type: 'transcript', role: 'assistant', text: content.outputTranscription.text });
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) {
            if (!base64(part.inlineData.data, 350_000)) { close('Invalid audio received from the conversation provider.'); return; }
            send({ type: 'audio', data: part.inlineData.data });
          }
        }
        if (content?.turnComplete) { tools.finishTurn(); send({ type: 'turn_complete' }); }
        for (const id of message.toolCallCancellation?.ids ?? []) tools.cancel(id);
        for (const call of message.toolCall?.functionCalls ?? []) {
          void tools.handle(call).then(result => {
            if (!closed) provider?.sendToolResponse({ functionResponses: [{ id: call.id, name: call.name, response: result }] });
          }).catch(() => close('The conversation tool connection failed.'));
        }
      } catch { close('The conversation response could not be processed.'); }
    }

    client.on('message', raw => {
      if (closed) return;
      try {
        const now = Date.now();
        if (now - messageWindow > 1000) { messageWindow = now; messageCount = 0; }
        if (++messageCount > 80) throw new Error('Too many messages.');
        const input: unknown = JSON.parse(raw.toString());
        if (!isRecord(input)) throw new Error('Expected a message.');
        switch (input.type) {
          case 'context': {
            if (!hasOnlyKeys(input, ['type', 'sequence', 'playback', 'practiceStartedAt'])) throw new Error('Invalid context.');
            const checked = input.sequence === null ? null : validateSequence(input.sequence, options.catalog ?? [], options.compositionPolicy);
            if (checked && !checked.ok) throw new Error('Unsupported sequence context.');
            const sequence = checked?.ok ? checked.sequence : null;
            if (input.playback !== null) {
              const value = input.playback;
              if (!sequence || !isRecord(value) || value.sequenceId !== sequence.id ||
                !Number.isInteger(value.stepIndex) || (value.stepIndex as number) < 0 || (value.stepIndex as number) >= sequence.steps.length ||
                !['preparing', 'moving', 'holding', 'returning', 'completed'].includes(String(value.phase)) ||
                !['playing', 'paused', 'completed'].includes(String(value.status)) || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) throw new Error('Invalid playback context.');
              playback = value as PlaybackState;
            } else playback = null;
            practiceStartedAt = typeof input.practiceStartedAt === 'number' && Number.isFinite(input.practiceStartedAt) &&
              input.practiceStartedAt <= now + 1000 && input.practiceStartedAt >= now - 600_000 ? input.practiceStartedAt : null;
            tools.setSequence(sequence);
            if (!initialized) {
              initialized = true;
              if (!options.geminiApiKey) { close('Gemini conversation provider is not configured on the backend.'); return; }
              const connect = options.connectConversation ?? geminiConnector(options.geminiApiKey, options.conversationModel, options.geminiApiVersion);
              void connect({ message: receiveProvider,
                error: () => close('Conversation provider failed. Check the backend key, model access and API version.'),
                close: () => close('Conversation provider disconnected. Start a new session.'),
              }).then(connection => {
                if (closed) { connection.close(); return; }
                provider = connection; clearTimeout(startTimeout);
                send({ type: 'ready', conversationModel: options.conversationModel, plannerModel: options.model });
              }).catch(() => close('Could not connect to Gemini. Check the backend key, model access and API version.'));
            }
            break;
          }
          case 'audio':
            if (!hasOnlyKeys(input, ['type', 'data']) || !base64(input.data, 12_800)) throw new Error('Invalid microphone audio.');
            provider?.sendRealtimeInput({ audio: { data: input.data, mimeType: 'audio/pcm;rate=16000' } }); break;
          case 'image':
            if (!hasOnlyKeys(input, ['type', 'data', 'observedAt']) || !base64(input.data, 350_000) ||
              typeof input.observedAt !== 'number' || !Number.isFinite(input.observedAt)) throw new Error('Invalid camera frame.');
            if (now - input.observedAt > 2000 || input.observedAt > now + 1000 || now - lastImage < 1000) break;
            lastImage = now;
            provider?.sendRealtimeInput({ video: { data: input.data, mimeType: 'image/jpeg' } }); break;
          case 'text':
            if (!hasOnlyKeys(input, ['type', 'text']) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000) throw new Error('Invalid text.');
            tools.noteTextInput(input.text);
            provider?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: input.text }] }], turnComplete: true }); break;
          case 'applied':
            if (!hasOnlyKeys(input, ['type', 'commandId', 'ok']) || typeof input.commandId !== 'string' || typeof input.ok !== 'boolean') throw new Error('Invalid action acknowledgment.');
            pending.get(input.commandId)?.finish(input.ok); break;
          case 'control':
            if (!hasOnlyKeys(input, ['type', 'name']) || !['pause_movement', 'resume_movement', 'stop_movement'].includes(String(input.name))) throw new Error('Invalid control.');
            void tools.control(input.name as 'pause_movement' | 'resume_movement' | 'stop_movement').catch(() => {}); break;
          case 'form': {
            const report = input.report;
            const sequence = tools.currentSequence;
            if (!hasOnlyKeys(input, ['type', 'report']) || !isRecord(report) || !sequence || !playback || report.sequenceId !== sequence.id || report.stepIndex !== playback.stepIndex ||
              typeof report.observedAt !== 'number' || !Number.isFinite(report.observedAt) || now - report.observedAt > 2000 || report.observedAt > now + 1000 ||
              !['aligned', 'needs_adjustment', 'not_observable', 'unavailable'].includes(String(report.status))) break;
            const expected = deriveFormPlan(sequence).get(playback.stepIndex);
            const practice = practiceStartedAt !== null && playback.status === 'completed' && playback.stepIndex === sequence.steps.length - 1;
            const status = expected && report.checkId === expected &&
              (practice || (playback.phase === 'holding' && playback.status === 'playing'))
              ? report.status as 'aligned' | 'needs_adjustment' | 'not_observable' | 'unavailable' : 'unavailable';
            const key = JSON.stringify([sequence.id, playback.stepIndex, practice ? 'practice' : 'demonstration', status]);
            if (key === lastForm || (status !== 'not_observable' && status !== 'unavailable' && now - lastFormAt < 2500)) break;
            lastForm = key; lastFormAt = now;
            const speakFeedback = practice && status !== 'unavailable';
            provider?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `DETERMINISTIC_FORM_STATUS ${JSON.stringify({
              sequenceId: sequence.id, stepIndex: playback.stepIndex, checkId: expected ?? null,
              mode: practice ? 'practice' : 'demonstration', status, message: formMessage(status),
            })}. This is application context, not a new user request. Do not invoke movement tools.${speakFeedback ? ' Speak the supplied message once, using its exact words. Do not add a broader form or safety judgment.' : ' Retain as context; no spoken update is requested.'}` }] }], turnComplete: speakFeedback });
            break;
          }
          default: throw new Error('Unknown message.');
        }
      } catch { close('Invalid live-session message. Restart the session.'); }
    });
    client.on('close', () => close());
    client.on('error', () => close());
  });
  return sockets;
}
