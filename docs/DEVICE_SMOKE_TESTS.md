# Reusable Android device smoke checks

`npm run test:device` runs stable-selector replays through the **agent-device command returned by `device_open`**. It reuses that bound Device-panel session, never selects another device/session, and uses no adb/simctl UI automation. `replay` is deliberate: the tool's `test` command creates child sessions that can conflict with the existing Device-panel lease.

## Setup and commands

Use the current combined Android development APK, running Metro and the backend. Grant camera/microphone permissions once through the app before unattended verification. Expo Go, iOS and browser previews are outside this suite's current scope.

An agent must call `device_open` for the intended device and pass the returned executable path. If that path stops existing, call `device_open` again. Do not substitute an unbound CLI, close another session or switch transports.

```sh
npm run test:device -- \
  --agent-device /absolute/path/returned/by/device_open/agent-device \
  --backend-url http://127.0.0.1:3002 \
  --metro-url http://127.0.0.1:8083
```

`--backend-url` is the **host-side** health-check address. The app's `EXPO_PUBLIC_API_BASE_URL` must already reach the same backend from the device (for example `http://10.0.2.2:3002` on the Android emulator). `--metro-url` is the Metro URL reachable from that device; forwarded loopback works on this configured emulator, while a phone may need a LAN address or established USB forwarding. Omitting it reuses the development client's saved connection.

For fast local checks without provider calls, add `--local-only`. To require real landmark arrival with a person visible, add `--require-pose`; otherwise zero landmark frames are reported as unsupported, never passed. `--json` emits one machine-readable result. `--artifacts-dir PATH` controls artifact storage; the default is a timestamped directory under ignored `.expo/device-smoke/`.

For regressions plus device checks in one command:

```sh
AGENT_DEVICE_COMMAND=/absolute/path/from/device_open/agent-device \
AGENT_TEST_BASE_URL=http://127.0.0.1:3002 \
AGENT_DEVICE_METRO_URL=http://127.0.0.1:8083 \
npm run check:device
```

The replays use `naturalmotion://live?diagnostics=1`, a development-only diagnostics view containing the local reference, typed request and playback controls. Normal entry at `/live` still opens the call layout directly. End in diagnostics leaves the stopped screen visible so cleanup can be verified; End in the normal call returns home.

Ordinary CI keeps running `npm run check` and `npm run export:android`; it does not silently launch a device or consume provider credits. The full device suite uses the explicitly labeled development **Test live requests with text** mode and sends one text request to the actual configured Gemini/OpenAI path. Native microphone capture remains local in this mode, preventing ambient speech from replacing the scripted text request; camera images and provider responses remain real. Normal **Start live coach** still streams microphone input. This typed test does not establish hands-free speech quality. Local mode uses the clearly labeled authored reference and sends no media to providers.

## What the cases prove

| Check | Assertions |
| --- | --- |
| App launch | Selected development client launches; optional Metro cold-load landmark appears. |
| Local controls and cleanup | Local media starts; an authored validated reference reaches renderer playback; repeated End requests finish cleanup; camera view disappears; media can restart and stop. |
| Live connection and playback | App connects to configured providers; a generated movement reaches the renderer; pause/resume states are reported; playback completes; the final-goalpost button enters practice while the session stays connected; Clear removes the sequence; End finishes cleanup. |
| Diagnostic camera | Local sampled camera images arrive, camera restart creates a new generation, and images arrive from that generation. Images stay local in diagnostics. |
| Pose arrival | A native landmark frame is observed, or explicitly unsupported when none is observed. This does not assess pose accuracy. |
| Final cleanup | The live route returns to its stopped state after diagnostics. |

Playback markers use the renderer's reported `PlaybackState`, not merely receipt of a model response. Connection markers become ready only after WebSocket and native audio startup complete. Stopped markers wait for native cleanup; subsequent restart also checks that old shutdown has not disabled the new session. The same canonical sequence/domain validators and server protocol tests remain authoritative.

The replay sources are in `tests/device/`. Stable `testID` hooks are confined to the live/session screen and development diagnostics. Preserve them when Roland changes the layout, or update the flows alongside the UI. Scroll-until selectors avoid hardcoded coordinates and screenshot guessing. Never replace a missing assertion with a blind tap or an arbitrary sleep.

## Results and failures

The runner prints compact `PASS`, `FAIL` and `UNSUPPORTED` lines and saves `summary.json`, each command's JSON/diagnostic output, and best-effort failure snapshots/screenshots. It stops on the first device-command failure rather than retrying actions or continuing into a different state. If diagnostic capture fails, it stops capturing. Inspect the stored error/hint before any manual recovery.

Exit codes: **0** means all required checks passed; **1** means a check failed; **2** means required verification could not run (for example no bound command or an unconfigured backend). Optional pose absence and explicitly chosen local-only coverage do not masquerade as required passes. Artifacts can contain app text/camera context and remain local in ignored `.expo/` unless deliberately shared.

The Node regression suite also checks summary classification, rejects malformed/failed device envelopes, and uses an explicitly mocked transport to verify failure artifact capture and fail-fast behavior. Mock transport tests are not counted as device evidence.

## Manual review remains necessary

Continue manual visual review for avatar deformation, animation changes and layout changes. Real camera/audio quality, audible responses, speech at stretching distance, echo suppression and sustained physical-device performance need the presentation phone. These checks do not certify muscle activation, clinical exercise technique, wall contact, or overall correct form. Emulator success establishes none of those qualities.

## Recorded run

Android 17/API 37 emulator, combined development APK, actual configured providers: **5 pass, 0 fail, 1 unsupported**. The unsupported item was pose-landmark arrival from the virtual no-person feed; diagnostic sampled-image arrival and restart passed. See [DEVICE_SMOKE_RESULTS.json](DEVICE_SMOKE_RESULTS.json) for the compact evidence. Earlier manual avatar findings remain in [LATENCY_AND_AVATAR_VERIFICATION.md](LATENCY_AND_AVATAR_VERIFICATION.md).

The Samsung SM-S928U physical Android 17 phone also passed five checks, with pose arrival unsupported while no person was tracked. Startup fixes, earlier failures and remaining human acceptance are recorded in [PHYSICAL_PHONE_TEST_RESULTS.md](PHYSICAL_PHONE_TEST_RESULTS.md).
