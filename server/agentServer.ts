import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describeCatalog, parseMovementPlan } from '../src/agent/plan';
import { componentCatalog } from '../src/shared/catalog';
import { validateSequence } from '../src/shared/validateSequence';

/**
 * Local-development service only. Do not expose this unauthenticated HTTP
 * server to the public internet. API credentials never enter the mobile app.
 */
const host = process.env.AGENT_HOST ?? '127.0.0.1';
const port = Number(process.env.AGENT_PORT ?? '8787');
const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = '';
  for await (const piece of req) {
    body += piece.toString();
    if (Buffer.byteLength(body) > 16_384) throw new Error('Request body too large.');
  }
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Expected JSON object.');
  }
  return parsed as Record<string, unknown>;
}

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['speech', 'steps'],
  properties: {
    speech: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['componentId', 'parameters'],
        properties: {
          componentId: { type: 'string' },
          parameters: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'value'],
              properties: { name: { type: 'string' }, value: { type: 'number' } },
            },
          },
        },
      },
    },
  },
} as const;

async function generate(utterance: string, currentSequence: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is missing on the server.');

  const validCurrent = validateSequence(currentSequence, componentCatalog);
  const previous = validCurrent.ok ? validCurrent.sequence : null;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      model,
      instructions: [
        'You are NaturalMotion, a conversational guide for everyday stiffness and general movement education.',
        'Never diagnose, identify the cause of pain, promise relief, or substitute for a clinician.',
        'If the request includes serious symptoms, acute injury, worsening pain, or uncertainty about safety, do not construct movements; recommend appropriate professional evaluation.',
        'Choose components ONLY from the executable catalog and use each required parameter exactly once within its range.',
        'Never invent joint angles, muscle activation measurements, or unsupported exercises.',
        'For a normal supported request, return a short spoken explanation and the desired sequence steps.',
        'For an unsupported request or a question not requiring playback, return steps as [].',
        'For modifications, return the entire proposed sequence, not only the changed parameter.',
        'The catalog is authoritative. Respond using JSON conforming to the supplied schema.',
        'Executable catalog:\n' + describeCatalog(componentCatalog),
        'Current sequence:\n' + JSON.stringify(previous),
      ].join('\n\n'),
      input: utterance,
      text: { format: { type: 'json_schema', name: 'movement_plan', strict: true, schema: responseSchema } },
      max_output_tokens: 750,
    }),
  });
  if (!response.ok) throw new Error(`Model provider returned HTTP ${response.status}.`);
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('output' in result) ||
      !Array.isArray(result.output)) throw new Error('Unexpected provider response.');
  const chunks = result.output.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object' || !('content' in item) ||
        !Array.isArray(item.content)) return [];
    return item.content
      .filter((part: unknown) => part && typeof part === 'object' &&
        'type' in part && part.type === 'output_text' && 'text' in part &&
        typeof part.text === 'string')
      .map((part: { text: string }) => part.text);
  });
  if (chunks.length === 0) throw new Error('Provider returned no structured text.');
  const plan = parseMovementPlan(JSON.parse(chunks.join('')), componentCatalog, `seq_${randomUUID()}`);
  if (!plan.ok) throw new Error(`Rejected model plan: ${plan.error}`);
  return { speech: plan.speech, ...(plan.sequence ? { sequence: plan.sequence } : {}) };
}

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { status: 'ok', providerConfigured: Boolean(process.env.OPENAI_API_KEY), catalogSize: componentCatalog.length });
  }
  if (req.url !== '/agent/respond' || req.method !== 'POST') {
    return json(res, 404, { error: 'Not found.' });
  }
  try {
    const body = await readBody(req);
    if (typeof body.utterance !== 'string' || !body.utterance.trim() ||
        body.utterance.length > 2_000) return json(res, 400, { error: 'Invalid utterance.' });
    if (componentCatalog.length === 0) {
      return json(res, 200, { speech: 'No movements have been enabled yet. Please check back once the team has verified the first demonstration.' });
    }
    const output = await generate(body.utterance, body.currentSequence);
    return json(res, 200, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Do not include credentials, prompts, or model payloads in client errors.
    console.error('Agent request failed:', message);
    return json(res, 502, { error: 'Could not generate a verified movement response.' });
  }
}).listen(port, host, () => {
  console.log(`NaturalMotion agent dev service listening on http://${host}:${port}`);
});
