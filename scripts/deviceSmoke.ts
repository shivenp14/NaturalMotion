import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { deviceResult, poseFrameCount, smokeSummary, type SmokeCheck } from './deviceSmokeSupport';

const args = process.argv.slice(2);
const value = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const help = `Device smoke checks (Android development build):
  npm run test:device -- --agent-device /path/from/device_open [--backend-url http://127.0.0.1:3001]
  Optional: --metro-url http://127.0.0.1:8081 --local-only --require-pose --json --artifacts-dir PATH
  Or set AGENT_DEVICE_COMMAND and AGENT_TEST_BASE_URL. Run from the repository root.
  Use device_open first; the command must be bound to the intended device/session.
  Exit 0: required checks pass; 1: failure; 2: required verification unsupported/unavailable.`;

async function main() {
  if (args.includes('--help')) { console.log(help); return; }
  const command = value('--agent-device') ?? process.env.AGENT_DEVICE_COMMAND;
  const directory = resolve(value('--artifacts-dir') ?? `.expo/device-smoke/${new Date().toISOString().replaceAll(':', '-')}`);
  await mkdir(directory, { recursive: true });
  const checks: SmokeCheck[] = [];
  const json = args.includes('--json');
  let sequence = 0; let deviceFailed = false; let opened = false;
  const add = (check: SmokeCheck) => { checks.push(check); if (!json) console.log(`${check.status.toUpperCase()} ${check.name}${check.durationMs !== undefined ? ` (${(check.durationMs / 1000).toFixed(1)}s)` : ''}${check.reason ? `: ${check.reason}` : ''}`); };
  const invoke = async (parameters: string[], label: string, timeout = 105_000) => {
    const log = join(directory, `${String(++sequence).padStart(2, '0')}-${label}.log`);
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>(done => {
      execFile(command!, parameters, { cwd: process.cwd(), timeout, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        done({ stdout, stderr, code: error ? typeof error.code === 'number' ? error.code : 1 : 0 });
      });
    });
    await writeFile(log, `${result.stdout}\n${result.stderr}`);
    const verdict = deviceResult(result.stdout, result.code);
    if (!verdict.ok) throw Object.assign(new Error(verdict.reason), { log });
    return { data: JSON.parse(result.stdout) as unknown, log };
  };
  const captureFailure = async () => {
    // Read-only diagnostics only. Stop immediately if capture itself fails;
    // never change sessions, retry actions or switch device transports.
    try {
      await invoke(['snapshot', '-i', '--json'], 'failure-snapshot', 15000);
      await invoke(['screenshot', join(directory, 'failure.png'), '--json'], 'failure-screenshot', 15000);
    } catch { /* The original failure and tool diagnostics remain in their logs. */ }
  };
  const run = async (name: string, action: () => Promise<unknown>) => {
    const started = Date.now();
    try { await action(); add({ name, required: true, status: 'pass', durationMs: Date.now() - started }); }
    catch (error) {
      deviceFailed = true;
      add({ name, required: true, status: 'fail', durationMs: Date.now() - started,
        reason: error instanceof Error ? error.message : String(error), log: (error as { log?: string })?.log });
      await captureFailure();
    }
  };
  try {
    if (!command) { add({ name: 'device_setup', required: true, status: 'unsupported', reason: 'Call device_open and provide its bound agent-device path with --agent-device or AGENT_DEVICE_COMMAND.' }); return; }
    try { await access(command, constants.X_OK); }
    catch { add({ name: 'device_setup', required: true, status: 'unsupported', reason: 'The bound command is unavailable. Call device_open again; do not select or close another session.' }); return; }
    const app = JSON.parse(await readFile('app.json', 'utf8')).expo;
    const appId: string = app.android.package;
    const liveUrl = `${app.scheme}://live`;
    const environment = ['--env', `APP_ID=${appId}`, '--env', `LIVE_URL=${liveUrl}`, '--env', `DIAGNOSTIC_URL=${app.scheme}://vision-debug`];
    const replay = (file: string) => invoke(['replay', resolve('tests/device', file), ...environment, '--keep-session', '--timeout', '90000', '--json'], file.replace('.ad', ''));
    await run('app_launch', async () => {
      const metro = value('--metro-url') ?? process.env.AGENT_DEVICE_METRO_URL;
      await invoke(['open', appId, ...(metro ? [`${app.scheme}://expo-development-client/?url=${encodeURIComponent(metro)}`] : []), '--relaunch', '--json'], 'launch');
      opened = true;
      // The route is explicit in every flow; cold Metro initialization is
      // allowed to finish before replay starts sending navigation intents.
      if (metro) await invoke(['wait', 'id="session-screen"', '30000', '--json'], 'bundle-ready', 40000);
    });
    if (deviceFailed) return;
    await run('avatar_view_rotation', () => replay('avatar-views.ad'));
    if (deviceFailed) return;
    await run('local_controls_cleanup', () => replay('local-controls.ad'));
    if (deviceFailed) return;
    if (args.includes('--local-only')) add({ name: 'live_connection_playback', required: false, status: 'unsupported', reason: 'Explicit local-only run; no provider request made.' });
    else {
      let available = false;
      let reason = '';
      const backend = value('--backend-url') ?? process.env.AGENT_TEST_BASE_URL ?? 'http://127.0.0.1:3001';
      try {
        const url = new URL(backend);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Expected a backend HTTP(S) URL without credentials/query/fragment.');
        const response = await fetch(`${backend.replace(/\/$/, '')}/live/health`, { signal: AbortSignal.timeout(5000) });
        const health = await response.json();
        available = response.ok && health.conversationConfigured === true && health.plannerConfigured === true;
        reason = 'The host backend is reachable but both live providers are not configured.';
      } catch (error) { reason = error instanceof Error ? `Host backend preflight: ${error.message}` : 'Host backend preflight failed.'; }
      if (!available) add({ name: 'live_connection_playback', required: true, status: 'unsupported', reason });
      else await run('live_connection_playback', () => replay('live-playback.ad'));
    }
    if (deviceFailed) return;
    add({ name: 'automatic_practice_and_form_quality', required: false, status: 'unsupported',
      reason: 'Requires a person holding the starting pose and following the replay. Unit tests cover synthetic geometry; this unattended smoke run does not verify human form quality.' });
    await run('diagnostic_camera_frames_restart', () => replay('diagnostic-camera.ad'));
    if (deviceFailed) return;
    if (args.includes('--require-pose')) {
      await run('pose_frame_arrival', () => invoke(['wait', 'id="vision-pose-arrived"', '20000', '--json'], 'pose-wait', 30000));
      if (deviceFailed) return;
    } else {
      const result = await invoke(['get', 'text', 'id="vision-pose-status"', '--json'], 'pose-status', 15000);
      const frames = poseFrameCount(result.data);
      add({ name: 'pose_frame_arrival', required: false, status: frames === null ? 'fail' : frames > 0 ? 'pass' : 'unsupported',
        reason: frames === null ? 'Pose frame counter was unreadable.' : frames > 0 ? `${frames} landmark frames observed; accuracy is not assessed.` : 'No landmark frames observed. A virtual/no-person feed cannot verify human pose arrival.' });
      if (frames === null) { deviceFailed = true; await captureFailure(); }
    }
  } catch (error) {
    deviceFailed = true;
    add({ name: 'smoke_runner', required: true, status: 'fail', reason: error instanceof Error ? error.message : String(error) });
    if (opened) await captureFailure();
  } finally {
    if (opened && !deviceFailed) await run('final_cleanup', async () => {
      const app = JSON.parse(await readFile('app.json', 'utf8')).expo;
      await invoke(['open', app.android.package, `${app.scheme}://live`, '--json'], 'cleanup-route');
      await invoke(['press', 'id="live-end"', '--json'], 'cleanup-stop');
      await invoke(['wait', 'id="live-stopped"', '15000', '--json'], 'cleanup-verified', 20000);
    });
    const report = { ...smokeSummary(checks), checks, artifacts: directory,
      manualReview: ['Avatar deformation and animation/layout appearance', 'Real camera/audio quality, audible speech and physical-device sustained performance'] };
    await writeFile(join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (json) console.log(JSON.stringify(report));
    else console.log(`${report.outcome.toUpperCase()}: ${report.counts.pass} pass, ${report.counts.fail} fail, ${report.counts.unsupported} unsupported. Artifacts: ${directory}`);
    process.exitCode = report.exitCode;
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Device smoke runner failed.'); process.exitCode = 1; });
