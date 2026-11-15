export type SmokeCheck = {
  name: string; status: 'pass' | 'fail' | 'unsupported'; required: boolean;
  reason?: string; durationMs?: number; log?: string;
};

export function smokeSummary(checks: readonly SmokeCheck[]) {
  const counts = { pass: 0, fail: 0, unsupported: 0 };
  for (const check of checks) counts[check.status]++;
  const exitCode = counts.fail ? 1 : checks.some(check => check.required && check.status === 'unsupported') || !counts.pass ? 2 : 0;
  return { counts, exitCode, outcome: exitCode === 0 ? 'pass' : exitCode === 1 ? 'fail' : 'unsupported' };
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

export function poseFrameCount(value: unknown): number | null {
  for (const text of strings(value)) {
    const match = /Pose frames:\s*(\d+)/.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

/** Failed tool envelopes must never become PASS merely because process exit was zero. */
export function deviceResult(stdout: string, exitCode: number) {
  let result: { success?: boolean; error?: { code?: string; message?: string } };
  try { result = JSON.parse(stdout); }
  catch { return { ok: false, reason: 'Device command did not return a readable JSON result.' }; }
  return { ok: exitCode === 0 && result.success === true,
    reason: result.error ? `${result.error.code ?? 'DEVICE_ERROR'}: ${result.error.message ?? 'Device operation failed.'}` : `Device command exited ${exitCode}.` };
}
