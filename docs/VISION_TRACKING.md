# Camera tracking investigation

The supplied November 14 recording shows intermittent landmark acquisition, long gaps without
an overlay, and a form result remaining visible after the person approaches/leaves the view.
The reported sideways/collapsed skeleton is not established by the sampled recording frames.

## Changes

- Android now rotates CameraX pixels upright before inference, using the frame's rotation
  metadata. MediaPipe receives rotation zero; the library's downstream landmark/world rotation
  is consequently zero too. Front-camera data remains unmirrored; the existing overlay mirrors
  it to match the preview. Row-padding handling is preserved. The rotated bitmap and Canvas are
  reused rather than allocated per frame.
- This bypasses the library's metadata-rotation path for live camera tracking. It follows the
  pixel-rotation approach in Google's Android sample. It is a mitigation for the suspected
  coordinate/tracking issue, not a device-confirmed root cause.
- The config plugin now bundles Full instead of Lite. Confidence is explicitly 0.5, rather than
  the library's single-person default of 0.6. This is a starting point for device testing;
  better acquisition and its inference cost must be measured on the presentation phone.
- Unobservable frames immediately invalidate the last form judgment. Recovery still requires
  four consecutive matching observations. If no pose callback arrives for over one second,
  a 200 ms watchdog clears the old measurements and reports tracking lost. This is necessary
  because the native library clears its overlay without emitting an empty onPose callback.
- Restart camera now remounts the native view, rather than only clearing UI counters.

## Patch delivery

`npm ci` runs `scripts/patch-pose-android.cjs`. The patch is pinned to package version 0.2.2,
checks original/patched source hashes, and fails on unexpected source changes. Its converter
replacement is in `patches/FrameConverter.kt` (upstream MIT notice is preserved alongside it). It changes installed library source, not generated
application native files. EAS installs must keep lifecycle scripts enabled. Review/remove this
patch when upgrading the package; do not widen the version range without testing.

These changes require a new development APK. Metro reloads and OTA updates cannot replace the
native converter or bundled model. Build with `npx eas-cli@latest build --platform android
--profile development`, install that APK, then run `npm start`.

## Verification

Lint, both TypeScript checks, the full test suite (`npm run check`) and the Android JavaScript
export pass. Android prebuild downloaded and bundled the Full model successfully. The new tests
cover immediate visibility loss, recovery, and expiry when native callbacks cease. The patched
Android pose module also passed `:react-native-pose-detection:compileDebugKotlin` with SDK 37 /
Java 21. A development APK was built, installed and exercised on the phone, which confirms the
upright-frame patch empirically; the numbers below remain the measurement to record.

On the actual phone, record cold acquisition time and tracking gaps across three repeated runs:

1. With the phone stationary in portrait, enter view with head, hips and both elbows visible.
   Use front lighting; the supplied clip has a bright ceiling behind the head and a dark torso.
2. Raise/lower arms repeatedly, turn the torso, briefly occlude an elbow, and return to view.
   Check that no sideways/collapsed skeleton appears and no invisible body retains “aligned”.
3. Leave the frame for several seconds, return, and exercise Restart camera. Confirm stale
   measurements disappear within about 1.2 seconds and scoring resumes only with steady evidence.
4. Repeat after background/resume and with the intended demo lighting. Record the phone model,
   Android version, measured inference fps, acquisition latency and any overlay misalignment.

If rotation still occurs, capture native camera/detector logs with frame rotation and dimensions;
do not compensate by rotating only the overlay or smoothing incorrect coordinates.

References: [Google's Android sample](https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/pose_landmarker/android/app/src/main/java/com/google/mediapipe/examples/poselandmarker/PoseLandmarkerHelper.kt),
[library configuration](https://khalid999devs.github.io/react-native-pose-detection/reference/pose-camera),
[library rotation troubleshooting](https://khalid999devs.github.io/react-native-pose-detection/troubleshooting).
