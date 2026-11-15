// Pinned compatibility + opt-in live JPEG patch. Source hashes fail closed on upgrades.
// Keeps one camera for local pose inference and sampled provider frames. Android only.
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packageRoot = path.dirname(require.resolve('react-native-pose-detection/package.json'));
if (JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version !== '0.2.2') {
  throw new Error('Review the pose patch before changing package version.');
}
const hash = source => createHash('sha256').update(source).digest('hex');
const files = [
  {
    "file": "android/src/main/java/com/posedetection/camera/FrameConverter.kt",
    "originalHash": "7535eec42be05da8989643f6d2233ea800dd413aacb19a62c20a81d2762bd715",
    "patchedHash": "627c77be1ffaf02cbea765d77fa841bf6f5fa7154de9b70bbb801e49f905b750",
    "replacementFile": "patches/FrameConverter.kt"
  },
  {
    "file": "android/src/main/java/com/posedetection/view/PoseCameraView.kt",
    "originalHash": "0981eef48d460e03d30b7719bf393916a5c7cf6e5f10543af5519d97ec688866",
    "intermediateHash": "c52026b4ebb3f9cc6a0fff010cd100c4ca8bfb4796ae2d68845c5755a1e0b517",
    "patchedHash": "27c2f3360a2b8416997cc9c07b55d7ff3b79abe28d58693fe8d31711a4cc0781",
    "replacements": [
      [
        "/** The bitmap is never rotated, so this is what stands the landmarks and frame size upright. */",
        "/** NaturalMotion supplies upright pixels; landmark and world rotations stay zero. */"
      ],
      [
        "val rotation = proxy.imageInfo.rotationDegrees",
        "// FrameConverter already applied CameraX rotation to the pixels.\n                val rotation = 0"
      ],
      [
        "    private val onLog by EventDispatcher<Map<String, Any?>>()",
        "    private val onLog by EventDispatcher<Map<String, Any?>>()\n    private val onCameraImage by EventDispatcher<Map<String, Any?>>()"
      ],
      [
        "    // region frame path",
        "    // NaturalMotion: one upright JPEG stream from the same camera used for pose inference.\n    @Volatile private var liveFramesEnabled = false\n    @Volatile private var lastLiveFrameMs = 0L\n\n    fun setLiveFramesEnabled(enabled: Boolean) {\n        liveFramesEnabled = enabled\n        if (!enabled) lastLiveFrameMs = 0L\n    }\n\n    private fun emitLiveFrame(bitmap: Bitmap) {\n        if (!liveFramesEnabled) return\n        val now = SystemClock.elapsedRealtime()\n        if (now - lastLiveFrameMs < 1000L) return\n        lastLiveFrameMs = now\n        val observedAt = System.currentTimeMillis()\n        val scale = minOf(1.0, 512.0 / maxOf(bitmap.width, bitmap.height))\n        val scaled = Bitmap.createScaledBitmap(bitmap,\n            maxOf(1, (bitmap.width * scale).toInt()), maxOf(1, (bitmap.height * scale).toInt()), true)\n        val bytes = java.io.ByteArrayOutputStream()\n        try {\n            if (!scaled.compress(Bitmap.CompressFormat.JPEG, 60, bytes)) return\n            val encoded = android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP)\n            post {\n                if (liveFramesEnabled && feeding) onCameraImage(mapOf(\n                    \"data\" to encoded, \"observedAt\" to observedAt, \"mirrored\" to false))\n            }\n        } finally {\n            if (scaled !== bitmap) scaled.recycle()\n            bytes.close()\n        }\n    }\n\n    // region frame path"
      ],
      [
        "                val bitmap = converter.convert(proxy)",
        "                val bitmap = converter.convert(proxy)\n                emitLiveFrame(bitmap)"
      ]
    ]
  },
  {
    "file": "android/src/main/java/com/posedetection/PoseDetectionModule.kt",
    "originalHash": "c6b6426732bf294f2ff02595dd675e803dfe9de4ddb4407b5c69438808ea709a",
    "intermediateHash": null,
    "patchedHash": "d7b990bdd9a4da0c39c8ea26ef5777e914c74649cdb94655d694b66e39fe9f81",
    "replacements": [
      [
        "                    \"onFrames\",",
        "                    \"onFrames\",\n                    \"onCameraImage\","
      ],
      [
        "                Prop(\"active\")",
        "                Prop(\"liveFramesEnabled\") { view: PoseCameraView, value: Boolean? ->\n                    view.setLiveFramesEnabled(value ?: false)\n                }\n                Prop(\"active\")"
      ]
    ]
  },
  {
    "file": "src/types/props.ts",
    "originalHash": "0cfeed03ce361dfb1a4e0f59e95427599f365d7f8976bdcb1e84416cdf35b148",
    "intermediateHash": null,
    "patchedHash": "afe87b3ed941dda43af868c9914eec52a5f1e853d2ff30bfe5868da57b458fc2",
    "replacements": [
      [
        "export type PoseCameraProps = {",
        "export type PoseCameraProps = {\n  /** Android-only opt-in JPEG sampling for NaturalMotion live sessions. */\n  liveFramesEnabled?: boolean;\n  onCameraImage?: (image: { data: string; observedAt: number; mirrored: boolean }) => void;\n"
      ]
    ]
  },
  {
    "file": "build/types/props.d.ts",
    "originalHash": "659311083d590e7a65727f369ae11101ceef099eeaeb3b62fd8e34e139ee8076",
    "intermediateHash": null,
    "patchedHash": "bccd16cac8191fe10b202052b5540e36d054f9e5f08b603e5692385924e1e963",
    "replacements": [
      [
        "export type PoseCameraProps = {",
        "export type PoseCameraProps = {\n  /** Android-only opt-in JPEG sampling for NaturalMotion live sessions. */\n  liveFramesEnabled?: boolean;\n  onCameraImage?: (image: { data: string; observedAt: number; mirrored: boolean }) => void;\n"
      ]
    ]
  },
  {
    "file": "src/PoseCamera.tsx",
    "originalHash": "ab4958337522b807ebab448dd75dc7190cc6f3b2e9754fd92c8b4e571fa85814",
    "intermediateHash": null,
    "patchedHash": "c05710361409448caf1046460ed75714f61271584ffa14e28044607bd61b725e",
    "replacements": [
      [
        "      onFrames={handleFrames}",
        "      liveFramesEnabled={props.liveFramesEnabled}\n      onCameraImage={(event: NativeEvent<{ data: string; observedAt: number; mirrored: boolean }>) => props.onCameraImage?.(event.nativeEvent)}\n      onFrames={handleFrames}"
      ]
    ]
  },
  {
    "file": "build/PoseCamera.js",
    "originalHash": "50001421a9eb43317e32cdf6f4b051c3154337225852b866f648b6b3743b31a2",
    "intermediateHash": null,
    "patchedHash": "1a24ed8b8cd6dec70f8d42780e724257c747426d23d453e7d58dc648c5e828b1",
    "replacements": [
      [
        "onFrames: handleFrames,",
        "liveFramesEnabled: props.liveFramesEnabled, onCameraImage: (event) => props.onCameraImage?.(event.nativeEvent), onFrames: handleFrames,"
      ]
    ]
  }
];
const writes = files.map(entry => {
  const target = path.join(packageRoot, entry.file);
  let source = readFileSync(target, 'utf8');
  const current = hash(source);
  if (current === entry.patchedHash) return null;
  if (current !== entry.originalHash && current !== entry.intermediateHash) throw new Error(`Unexpected pose source: ${entry.file}`);
  if (entry.replacementFile) source = readFileSync(path.join(root, entry.replacementFile), 'utf8');
  else for (const [before, after] of entry.replacements) source = source.replace(before, after);
  if (hash(source) !== entry.patchedHash) throw new Error(`Pose patch mismatch: ${entry.file}`);
  return { target, source };
});
for (const entry of writes) if (entry) writeFileSync(entry.target, entry.source);
console.log('Pose 0.2.2 upright pixels + opt-in live camera frames patched.');
