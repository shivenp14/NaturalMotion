import { createAgentServer } from './http';

const port = Number(process.env.AGENT_PORT ?? 3001);
const host = process.env.AGENT_HOST ?? '127.0.0.1';
const server = createAgentServer({ apiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'gpt-6-astra' });
server.listen(port, host, () => {
  console.log(`NaturalMotion agent backend listening on http://${host}:${port}`);
  if (!process.env.OPENAI_API_KEY) console.log('Provider not configured. Set OPENAI_API_KEY in server/.env.');
});
