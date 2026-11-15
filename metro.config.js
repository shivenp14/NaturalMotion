const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'glb'])];

// R3F's native bundle uses require('three'). Three r187's CommonJS wrapper
// calls Node-only process.emitWarning, which crashes on Hermes. Resolve all
// bare Three imports to the same ESM build so loaders and instanceof agree.
const threeModule = path.join(path.dirname(require.resolve('three')), 'three.module.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
