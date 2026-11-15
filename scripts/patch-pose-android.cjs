// Local compatibility patch for react-native-pose-detection 0.2.2. Applies on npm ci,
// including EAS builds. Never edit generated android/ files. See docs/VISION_TRACKING.md.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageRoot = path.dirname(require.resolve('react-native-pose-detection/package.json'));
const version = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
if (version !== '0.2.2') throw new Error(`Review the Android pose patch before upgrading to ${version}`);

const hash = (source) => createHash('sha256').update(source).digest('hex');
const files = [
  {
    file: 'camera/FrameConverter.kt',
    originalHash: '7535eec42be05da8989643f6d2233ea800dd413aacb19a62c20a81d2762bd715',
    patchedHash: hash(readFileSync(path.join(root, 'patches/FrameConverter.kt'), 'utf8')),
    apply: () => readFileSync(path.join(root, 'patches/FrameConverter.kt'), 'utf8'),
  },
  {
    file: 'view/PoseCameraView.kt',
    originalHash: '0981eef48d460e03d30b7719bf393916a5c7cf6e5f10543af5519d97ec688866',
    patchedHash: 'c52026b4ebb3f9cc6a0fff010cd100c4ca8bfb4796ae2d68845c5755a1e0b517',
    apply: (source) => source
      .replace(
        '/** The bitmap is never rotated, so this is what stands the landmarks and frame size upright. */',
        '/** NaturalMotion supplies upright pixels; landmark and world rotations stay zero. */',
      )
      .replace(
        'val rotation = proxy.imageInfo.rotationDegrees',
        '// FrameConverter already applied CameraX rotation to the pixels.\n                val rotation = 0',
      ),
  },
];

// Validate every file before writing any. An unexpected upstream source must fail visibly.
const writes = files.map(({ file, originalHash, patchedHash, apply }) => {
  const target = path.join(packageRoot, 'android/src/main/java/com/posedetection', file);
  const source = readFileSync(target, 'utf8');
  if (hash(source) === patchedHash) return null;
  if (hash(source) !== originalHash) throw new Error(`Unexpected pose source: ${file}; review patch`);
  const patched = apply(source);
  if (hash(patched) !== patchedHash) throw new Error(`Pose patch did not match: ${file}`);
  return { target, patched };
});
for (const entry of writes) {
  if (entry) writeFileSync(entry.target, entry.patched);
}
console.log('Android pose upright-frame patch applied (0.2.2).');
