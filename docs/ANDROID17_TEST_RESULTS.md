# Android 17 emulator test results

Tested on 2026-11-14 using the local `Medium_Phone_API_37.0` Android 17 emulator (API 37), through Expo Go 58.0.5 and the project's SDK 58 Metro bundle.

This is a native runtime smoke test of the anatomy viewer. It is not a custom development-APK build, a physical-device benchmark, or a test of the future movement/camera/voice coaching flow.

## Results

| Check | Result |
| --- | --- |
| Load the real local GLB on native Expo GL | Pass |
| Render the graphite material and cosmetic fiber shader | Pass |
| Switch front, back, and side views | Pass |
| Highlight represented shoulder regions | Pass |
| Highlight upper-back regions and switch to the back view | Pass |
| Switch between region selections | Pass |
| Clear highlights with All gray | Pass |
| Reload through Metro and return to the default gray/front state | Pass |
| Session remains disabled with no registered movements | Pass |
| Current-process JS/native error logs after the fix | No error lines observed in the captured logs |

Native emulator screenshots of shoulder focus, upper-back focus, cleared highlights, and reload were captured locally and are not included in the repository. They are distinct from the earlier committed desktop material previews.

## Runtime fix discovered by the test

The original native startup failed in Three.js r187's CommonJS wrapper. React Three Fiber's native build uses `require('three')`, and that wrapper calls Node-only `process.emitWarning`, which Hermes does not implement. The route/default-export errors were a consequence of the failed import.

`metro.config.js` now resolves every bare `three` request to the same installed `three.module.js` ES-module build. This avoids the Node-only wrapper and keeps the renderer, loaders, and model helpers on one Three instance. Other module requests still use Metro's normal resolver. Two regression tests cover this resolution boundary.

The app then loaded successfully. The final process logs retained a nonfatal `THREE.Clock` deprecation warning from the renderer dependency and Expo GL `pixelStorei` informational messages. These did not block rendering, view changes, highlighting, or reload during this test. No claim of warning-free startup or sustained frame-rate performance is made.

## Emulator connection

For this test, direct `10.0.2.2` access failed to load the project. An ADB reverse connected emulator port 8081 to host Metro port 8081, and Expo Go opened `exp://127.0.0.1:8081` successfully. Metro was started with:

```bash
npm run start:go -- --localhost --port 8081
```

The official SDK 58 Expo Go Android APK was downloaded using the URL returned by Expo's version endpoint. The APK, logs, and bundler caches remain under ignored `.expo/` paths.

## Remaining milestone work

- Verify performance and appearance on the physical Android 17 presentation phone.
- Verify the team's custom development build once its native dependency set is settled.
- Select a first movement with Derrick and prove clean rig deformation using represented muscle regions.
- Add validated movement components, playback, and the camera/voice integrations in their respective milestones.

## Automated checks after the fix

Lint, app/test TypeScript checks, all 11 tests, and Android JavaScript export pass. The startup fix, regression tests, and these test notes are included on `feat/anatomy-viewer`; emulator screenshots remain local.
