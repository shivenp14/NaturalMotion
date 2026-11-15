import { createAgentServer } from './http';
import { anatomyAgentCapabilities } from '../src/anatomy/agentCapabilities';
import { attachLiveServer } from './live/socket';

const port = Number(process.env.AGENT_PORT ?? 3001);
const host = process.env.AGENT_HOST ?? '127.0.0.1';
const options = { apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'gpt-6-luna', ...anatomyAgentCapabilities,
  reasoningEffort: 'low' as const, geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  conversationModel: process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live',
  geminiApiVersion: process.env.GEMINI_API_VERSION ?? 'v1beta' };
const server = createAgentServer(options);
attachLiveServer(server, options);
server.listen(port, host, () => {
  console.log(`NaturalMotion agent backend listening on http://${host}:${port}`);
  if (!process.env.OPENAI_API_KEY) console.log('Provider not configured. Set OPENAI_API_KEY in server/.env.');
});
