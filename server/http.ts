import { createServer } from 'node:http';
import { generateAgentReturn, parseAgentRequest, RequestError, type AgentServiceOptions } from './agent';

/** Local development service. Default bind is loopback; do not expose it publicly without authentication. */
export function createAgentServer(options: AgentServiceOptions) {
  let active = 0;
  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/health') {
      send(200, { ready: Boolean(options.apiKey), provider: 'openai' }); return;
    }
    if (req.method !== 'POST' || req.url !== '/agent/respond') { send(404, { error: 'Not found.' }); return; }
    if (!options.apiKey) { send(503, { error: 'Agent provider is not configured.' }); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'Expected JSON.' }); return; }
    if (active >= 2) { send(429, { error: 'Agent busy. Try again shortly.' }); return; }
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnect);
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        length += Buffer.byteLength(chunk);
        if (length > 65_536) { send(413, { error: 'Request is too large.' }); return; }
        chunks.push(Buffer.from(chunk));
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new RequestError('Invalid JSON.'); }
      const request = parseAgentRequest(body, options.catalog, options.compositionPolicy);
      const result = await generateAgentReturn(request, options, controller.signal);
      send(200, result);
    } catch (error) {
      if (error instanceof RequestError) send(400, { error: error.message });
      else send(controller.signal.aborted ? 504 : 502, { error: 'The agent could not complete this request. Please try again.' });
    } finally {
      clearTimeout(timer);
      res.off('close', disconnect);
      active--;
    }
  });
}
