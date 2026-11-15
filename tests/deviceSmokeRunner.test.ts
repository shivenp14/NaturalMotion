import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('smoke runner captures a failed replay and stops without more UI mutations', async t => {
  // Mock transport only: this test is not device/UI verification.
  const directory = await mkdtemp(join(tmpdir(), 'device-smoke-fixture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const command = join(directory, 'mock-device.cjs'); const calls = join(directory, 'calls.jsonl');
  await writeFile(command, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
if (args[0] === 'replay') {
  console.log(JSON.stringify({success:false,error:{code:'REPLAY_DIVERGENCE',message:'Fixture expectation failed.'}}));
  process.exitCode = 1;
} else {
  if (args[0] === 'screenshot') fs.writeFileSync(args[1], 'mock screenshot artifact');
  console.log(JSON.stringify({success:true,data:{}}));
}
`, { mode: 0o755 });
  const artifacts = join(directory, 'artifacts');
  const result = await new Promise<{ code: number; stdout: string }>(resolve => {
    execFile(process.execPath, ['--import', 'tsx', 'scripts/deviceSmoke.ts', '--agent-device', command,
      '--local-only', '--artifacts-dir', artifacts, '--json'], { env: { ...process.env, AGENT_DEVICE_METRO_URL: '' } }, (error, stdout) => {
      resolve({ code: error ? Number(error.code) : 0, stdout });
    });
  });
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, 'fail'); assert.equal(report.counts.fail, 1);
  assert.equal(await readFile(join(artifacts, 'failure.png'), 'utf8'), 'mock screenshot artifact');
  const commands = (await readFile(calls, 'utf8')).trim().split('\n').map(line => JSON.parse(line)[0]);
  assert.deepEqual(commands, ['open', 'replay', 'snapshot', 'screenshot']);
  assert.equal(JSON.parse(await readFile(join(artifacts, 'summary.json'), 'utf8')).exitCode, 1);
});
