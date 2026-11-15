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

Ordinary CI keeps running `npm run check` and `npm run export:android`; it does not silently launch a device or consume provider credits. The full device suite uses the explicitly labeled development **Test live requests with text** mode and sends one text request to the actual configured Gemini/OpenAI path. Native microphone capture remains local in this mode, preventing ambient speech from replacing the scripted text request; camera images and provider responses remain real. Normal **Start live coach** still streams microphone input. This typed test does not establish hands-free speech quality. Local mode uses the clearly labeled authored reference and sends no media to providers.

## Conversation redesign

The landing screen opens `/live` and connects automatically. The camera and anatomy model remain mounted when swapping views. The three call buttons open conversation/movement controls, mute/unmute microphone transmission, and end the session. The conversation sheet contains pause/resume, stop, transcripts, and text requests. Practice still waits for the user's spoken finish cue before sending an attempt for review.

Development tools are available at `/development`; the existing explicit-start smoke flows now use `/live?diagnostics=1`. These diagnostics require a development build. They preserve the existing local/text test paths without adding diagnostic controls to the conversation screen.

## What the cases prove

| Check | Assertions |
| --- | --- |
| App launch | Selected development client launches; optional Metro cold-load landmark appears. |
| Avatar controls removed | Manual front/back/left/right/Auto and region-focus controls are absent. Live playback checks a voice-tool back-view request reaching renderer-settled state while playback remains paused. |
| Local controls and cleanup | Local media starts; an authored validated reference reaches renderer playback; repeated End requests finish cleanup; camera view disappears; media can restart and stop. |
| Live connection and playback | App connects to configured providers; a generated movement reaches the renderer; pause/resume states are reported; playback completes; the movement-matched assessment waits for readiness; Clear removes the sequence; End finishes cleanup. |
| Automatic practice and form quality | Reported as unsupported by the unattended suite. Requires a person performing a full self-paced repetition and correcting form on a subsequent attempt. The explicit no-person start/finish case verifies uncertainty handling only. |
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

The adaptive-form branch was tested only on that physical phone, using dedicated Metro port 8084: **5 pass, 0 fail, 2 unsupported**. It replaces the manual goalpost-button assertion with automatic-readiness waiting. Both human automatic practice/form quality and no-person landmark arrival remain unsupported in the unattended run. See [adaptive-form handoff](ADAPTIVE_FORM_COACHING.md) for current contracts, evidence and manual steps.

The subsequent avatar-view update passed **6 checks, 0 failed, 2 unsupported** on the same physical phone. The added check covers front/back/left/right rotation and Auto. The live case also rotates while paused and requests a back view through the real provider from a deliberately selected front view. Local artifacts: `.expo/device-smoke/avatar-views-final/`; behavior and UI boundaries are in [AVATAR_VIEWS.md](AVATAR_VIEWS.md).

Manual view/focus buttons were then removed. The revised suite also passed **6 checks, 0 failed, 2 unsupported**, verifying control absence and a view-only back request through the actual provider while playback remains paused. Local artifacts: `.expo/device-smoke/avatar-controls-removed-confirmed/`. Current test markers combine explicit preference and target view; automatic selection of the same angle cannot falsely satisfy a requested override.


The current self-paced flow starts quiet capture immediately after the demonstration and waits for **“I’m done”** before reviewing. The revised Samsung Android 17 suite passed **6 checks, 0 failed, 2 unsupported** in `.expo/device-smoke/spoken-completion/`. It exercises a natural finish phrase as text through the real conversation provider, resulting in a truthful not-observable review on the no-person feed. This does not verify microphone recognition, human pose arrival, or human form accuracy. See [the current practice handoff](SELF_PACED_PRACTICE.md).
