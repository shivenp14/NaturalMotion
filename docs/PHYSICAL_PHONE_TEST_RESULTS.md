# Physical Android smoke test — November 15, 2026

Device: Samsung SM-S928U, Android 17, arm64. Tested the combined development APK with main's JavaScript through USB-forwarded Metro 8083 and backend 3002, using the actual configured Gemini/OpenAI providers.

## Startup fixes

The initial local-media test stopped during startup. Activity logs showed redundant permission activities briefly backgrounding the app even with camera/microphone access already granted. Startup now reads permission status first; the camera view reads permission on mount instead of automatically requesting it again. Missing permissions can still be requested.

After that fix, the phone exposed a separate audio-output error: the default low-latency MMAP stream was rejected with AAudio error -899 and `Failed to resume audio context`. The supported `balanced` output hint passed local startup/restart while retaining communication routing and microphone voice processing. A delayed-resume experiment did not fix the failure and is not included.

The live replay now dismisses the Samsung keyboard and scrolls to Send before tapping it. One subsequent generated-playback wait timed out; the standalone debug recheck and the final complete suite passed. This is not three consecutive acceptance runs or a measured output-latency comparison.

## Verification

- `npm run check`: lint, both TypeScript configurations and all 122 tests pass.
- `npm run export:android`: passes.
- Final physical-phone suite: **5 pass, 0 fail, 1 unsupported**.
- Passed: launch; local media/reference playback and repeated cleanup/restart; real-provider connection, generated renderer playback, pause/resume/completion/clear; diagnostic sampled-camera arrival/restart; final shutdown.
- Unsupported: pose-landmark arrival, because no person was tracked during the automated run. Sampled camera images are not pose landmarks.
- A separate host provider-control request passed renderer compilation and returned audio. It is not phone microphone/speaker evidence.

Failure diagnostics and the final machine-readable summary remain local under ignored `.expo/device-smoke/`; the final run is `physical-final`. See [the reusable test guide](DEVICE_SMOKE_TESTS.md) for commands and limits.

## Remaining manual acceptance

Actual speech from movement distance, audible response quality/volume, echo and follow-up turns; a supported spoken modification; visible goalpost issue/adjustment and occlusion/recovery; manual avatar/layout review; background/return; and three consecutive complete presentation runs. The automated typed request does not establish these qualities. Output buffering changed, so assess audible responsiveness on this phone rather than reusing earlier host timings as a phone measurement.
