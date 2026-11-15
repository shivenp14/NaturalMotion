import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceResult, poseFrameCount, smokeSummary } from '../scripts/deviceSmokeSupport';

test('device summaries preserve unsupported checks without silently passing required verification', () => {
  const passed = { name: 'controls', required: true, status: 'pass' as const };
  const unavailable = { name: 'pose', required: false, status: 'unsupported' as const };
  assert.equal(smokeSummary([passed, unavailable]).exitCode, 0);
  assert.equal(smokeSummary([passed, { ...unavailable, required: true }]).exitCode, 2);
  assert.equal(smokeSummary([{ ...passed, status: 'fail' }, unavailable]).exitCode, 1);
  assert.equal(smokeSummary([]).exitCode, 2);
});

test('tool envelopes and native landmark counters are interpreted without invented success', () => {
  assert.equal(deviceResult('{"success":false,"error":{"code":"DEVICE_IN_USE","message":"Busy"}}', 0).ok, false);
  assert.equal(deviceResult('{"success":true}', 1).ok, false);
  assert.equal(deviceResult('not json', 0).ok, false);
  assert.equal(deviceResult('{"success":true}', 0).ok, true);
  assert.equal(poseFrameCount({ data: { text: 'Pose frames: 0' } }), 0);
  assert.equal(poseFrameCount({ data: { text: 'Pose frames: 12' } }), 12);
  assert.equal(poseFrameCount({ data: { text: 'No camera' } }), null);
});
