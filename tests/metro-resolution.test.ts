import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, resolve } from 'node:path';
import test from 'node:test';

const load = createRequire(resolve('package.json'));
const { resolver } = load('./metro.config.js');

test('native Three imports avoid the Node-only CommonJS warning wrapper', () => {
  const context = { resolveRequest: () => { throw new Error('Bare Three must use the ESM override.'); } };
  const result = resolver.resolveRequest(context, 'three', 'android');
  assert.equal(result.type, 'sourceFile');
  assert.equal(basename(result.filePath), 'three.module.js');
  assert.ok(existsSync(result.filePath));
  assert.deepEqual(resolver.resolveRequest(context, 'three', 'ios'), result);
});

test('the Three workaround preserves normal resolution for other modules', () => {
  const expected = { type: 'sourceFile', filePath: 'original-result' };
  const context = {
    resolveRequest: (ctx: unknown, name: string, platform: string) => {
      assert.equal(ctx, context);
      assert.equal(name, 'expo-asset');
      assert.equal(platform, 'android');
      return expected;
    },
  };
  assert.equal(resolver.resolveRequest(context, 'expo-asset', 'android'), expected);
});
