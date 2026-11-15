# Latency and avatar verification — November 15, 2026

The live movement planner still uses `gpt-6-luna` with **low** reasoning. Conversation uses `gemini-3.8-live`, without the extended-thinking model. A trial with planner reasoning `none` produced a rejected movement and was discarded; that trial is not counted as an improvement.

## Changes

- Gemini's movement tool is nonblocking. Starting an accepted planning job sends a continuing tool response with `status: planning`, requesting a brief acknowledgment. Only the final, app-acknowledged response can report success. Duplicate calls do not start another planning acknowledgment/job.
- The planner emits target angles and group timing. Deterministic code supplies starting angles from the initial pose/previous group and generates the sequence ID, then runs the unchanged catalog, composition and renderer validators. The model can still compose different supported movements; there is no exercise-name dispatch or canned sequence substitution.
- Successful plans omit explanatory speech and unchanged channels. Gemini handles conversation. Empty steps plus a short message represent an unsupported request.
- The same avatar stays mounted through sequence acceptance/clear/replacement. Live framing stays constant instead of jumping to a wider camera when the first sequence arrives.
- Starting from an already reached goalpost skips a redundant second of preparation. Other starting poses retain the smooth one-second transition; preparation is never replaced with a pose snap.
- Live media imports are eager to avoid a Metro lazy-bundle missing-module error encountered during verification.

## Live comparison

An isolated snapshot of commit `5fdf5ab` ran as the baseline. The same keys and provider models were used for both versions. Three movement prompts were sent to independent sessions in alternating before/after order, followed by one explanation-only prompt per version. All six final movement requests produced sequences accepted by the actual renderer compiler; neither explanation-only request triggered movement.

| Median wait after typed request | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| First response audio packet | 5.945 s | 0.908 s | 84.7% |
| Validated movement action received | 5.514 s | 3.689 s | 33.1% |
| Planning start through movement action | 5.221 s | 3.264 s | 37.5% |

After-change ranges: first audio 0.904–1.041 s, movement action 3.608–4.690 s. Each early response said it was preparing the demonstration; it did not claim that movement was ready. Explanation-only first audio was 0.443 s before and 0.656 s after; one sample per version cannot establish a change in ordinary conversation latency.

This is a small live-provider sample, not a percentile benchmark or latency guarantee. It excludes microphone endpoint detection, audible speaker onset and native animation onset. The host script acknowledges a valid action without rendering a body. The first audio is an acknowledgment, while detailed movement explanation follows planning. The body is already loaded and starts its local preparation/playback independently of Gemini's later explanation; precise speech/animation synchronization is not implemented.

Raw measurements: [LATENCY_RESULTS.json](LATENCY_RESULTS.json). Reproduce with the backend running:

```sh
AGENT_TEST_BASE_URL=http://127.0.0.1:3002 node --import tsx scripts/liveLatency.ts --out /tmp/live-latency.json
# Optional old backend for alternating paired requests:
AGENT_TEST_BASE_URL=http://127.0.0.1:3002 node --import tsx scripts/liveLatency.ts --baseline http://127.0.0.1:3004 --out /tmp/live-latency.json
```

The script validates generated sequences, rejects duplicate execution, records pre-action speech and fails on timeouts or unsupported output. It never replaces a failed plan with a reference animation.

## Avatar correctness and appearance

The renderer tests verify bounded, symmetric authored poses; preserved geometry and normalized skin weights; stationary torso attachment regions; continuous command transitions; exact holds/returns; pause/resume reports; and deterministic highlighting of represented parts. A regression samples the real rig's wrist position at 60 Hz through the reference movement and rejects large adjacent jumps. Another verifies preparation preserves the current pose and skips only an already reached starting pose.

Android 17 emulator recordings were inspected from front/back, with a side-view pose check, while local camera/microphone processing was active. The body raises and lowers both arms continuously and reaches the intended final goalpost; no whole-body spin, rig explosion or discontinuous limb flip was observed in the inspected reference sequence. The initial camera zoom jump was found and removed. A subsequent real Gemini/OpenAI request through the updated planner also played through step 2 completion on the emulator, with the preparation acknowledgment visible and both media streams active. Screen recording rate is not a measurement of the app's rendered FPS.

All 100 automated tests, lint, both TypeScript checks and Android JavaScript export passed. Changes are JavaScript/TypeScript only; they reuse the previously compiled combined native development APK.

The avatar is **not fully polished or independently biomechanically validated**. Shoulder/armpit separation, stretching of muscle surfaces and simplification around scapula/chest remain visible, especially at raised poses. The existing optional deformation refinement remains relevant. Highlighting is an educational selection of modeled regions, not measured activation or a complete physiological account. Wall contact, spinal mechanics, compensations and clinical exercise technique are not simulated or certified. Automated validity cannot guarantee every future composition looks equally natural.

Physical-phone acceptance still needs real speech input, audible responses, echo suppression and sustained camera/audio/graphics performance. This screen remains an integration surface for Roland's final UI.
