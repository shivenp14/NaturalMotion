# Two-model live coach

The Android `/live` route connects conversation, bounded movement planning, anatomy playback and one verified camera check. This is an integration screen; Roland can replace its layout while retaining the session/media boundaries.

See [latency improvements and avatar verification](LATENCY_AND_AVATAR_VERIFICATION.md) for the subsequent paired measurements, current planner wire format and visual limitations.

## Data flow

1. The phone streams 16 kHz mono PCM microphone audio to the local backend WebSocket at `/live`. The same native camera supplies local pose landmarks and sampled JPEGs (at most one per second, longest edge 512 px).
2. The backend proxies audio/images to Gemini Live (`gemini-3.8-live`, API `v1beta`). Gemini talks to the user and can request movement planning, pause, resume or stop. It never supplies executable joint values directly.
3. A movement request invokes OpenAI (`gpt-6-luna`, low reasoning), using the actual user utterance, conversation interpretation, current sequence and renderer-owned capabilities. It composes target-angle groups from the six supported shoulder/elbow components. Code derives starting angles and expands the groups to a complete replacement sequence. A nonblocking planning-progress response lets Gemini acknowledge the request before the sequence is ready.
4. The backend validates the sequence, the app validates acceptance, and the renderer independently compiles it before playback. Gemini receives tool success only after the app acknowledges acceptance; this does not mean playback has completed.
5. Deterministic code derives applicable checks from the composed endpoint. Currently only a stationary bilateral goalpost pose has a verified elbow-height/spread check. Other poses report `unavailable`; poor visibility or stale observations report `not_observable`.

The final goalpost can be checked after demonstration using **Check final goalpost position**. This starts explicit practice without changing the renderer's completed playback state. Four distinct steady observations are needed before a stable result. Loss of visibility is immediate. In practice, status changes request spoken feedback using the deterministic message; the model is instructed to repeat that message without expanding it into an overall form judgment. Actual spoken compliance still needs phone acceptance. A status is not a measurement of muscle activation, wall contact, spinal posture or complete correct form.

## Configuration

Only these two secret values are required in ignored `server/.env`:

```dotenv
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

Model names, API version, host and port have code defaults. Optional overrides are documented in `server/.env.example`. Do not copy that example over an already configured file. No provider secrets belong in an `EXPO_PUBLIC_*` variable.

```sh
npm ci
npm run server
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001 npm start -- --localhost
```

The public backend URL must be set separately for Metro, either as above or in root `.env`; it is not another provider key. The simulator uses `10.0.2.2` to reach the laptop. The latest isolated test used backend port 3002 and Metro 8083; ordinary defaults remain 3001 and 8081.

This requires a **new Android development build**, including `react-native-audio-api` and `react-native-pose-detection`; Expo Go and older APKs cannot run it. Use the existing EAS development profile or `npm run android`. Generated native directories remain ignored. `npm ci` applies the checked, version-pinned pose package patch automatically.

For a USB-connected Android phone, forward the backend (`adb reverse tcp:3001 tcp:3001`) and set `EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3001` when starting Metro. Alternatively bind the backend to a trusted LAN interface with `AGENT_HOST` and use that reachable address. The backend is a local-development service; authenticated sessions and HTTPS/WSS are needed before exposing it publicly.

Open **Open live coach** on the development session screen, then **Start live coach**. Grant camera/microphone access and speak, or use the text request panel to isolate provider/planner behavior. **Test devices locally** sends no audio/images to providers and plays only an explicit test tone/authored reference; it is not evidence of model success.

## Execution guards

- One movement plan per observed user turn; duplicate tool IDs reuse their result. Camera/status updates do not grant new planning turns.
- One plan in flight, 25-second planner timeout, cancellation on interruption/stop/close, and rejection of late results.
- Movement commands expire after five seconds and require app acknowledgment. Pause/stop remain available after the planning-call budget is exhausted.
- Bounded audio queues/network buffering, session/message limits and a ten-minute session lifetime.
- Backgrounding, unmounting or ending the session releases camera, microphone, playback audio and network state. Startup cancellation also prevents delayed permission/audio work from restoring a stopped session.
- Native CPU fallback is a warning, not a fatal camera failure.

## Verification — November 15, 2026

- Clean `npm ci` (including the pinned camera patch), lint, application/test TypeScript checks, all 96 automated tests and Android export passed. Native debug APK compiled and installed on Android 17/API 37 arm64 emulator.
- Real Gemini + OpenAI smoke test: generated groups accepted by the actual renderer compiler, followed by conversation audio and turn completion. Latest run: two groups, 10.6 seconds, 16 audio chunks.
- An explanation-only real-provider request returned audio without a movement action.
- On the emulator, Gemini described the actual checkerboard virtual camera feed without triggering movement. A separate live request produced avatar playback through completion.
- Goalpost practice with no visible human reported `not_observable`. Microphone packets and sampled camera frames incremented. **End coach** removed the camera and returned to a stopped state; its header control was moved clear of the development launcher.
- Simulator microphone input was silent. Audible output, real spoken-input recognition, echo suppression, distance and sustained combined-load performance remain **physical-phone acceptance**. Do not interpret audio packets or displayed transcripts as proof of audible sound.

Run `npm run check` and `npm run export:android`. With the backend running, `npm run test:live` exercises real providers, validates the returned sequence and acknowledges it as a host protocol test; it does not render a body. Use `AGENT_TEST_BASE_URL` for a nondefault port. Add `--audio-pcm /absolute/path/clip.pcm` to exercise spoken input instead of text; supply at most 30 seconds of PCM16 little-endian, 16 kHz mono audio (for example, convert a local recording using `ffmpeg -i recording.wav -f s16le -ar 16000 -ac 1 /tmp/request.pcm`). This mode sends the clip at real-time speed plus trailing silence through the same backend audio path. It does not access or test the phone microphone. `npm run test:live -- --expect-no-movement "Describe a wall angel in one sentence. Do not demonstrate or change any movement."` verifies an explanation-only turn.

On the presentation phone, verify: a spoken demonstration request; audible explanation while camera and body render; no movement for a camera-description question; interruption and pause/stop; final-goalpost practice with visible and hidden elbows; background/return and restart. Record device model and observations. Issue #3 stays open until phone audio and teammate handoff acceptance.

## Ownership and retained paths

Selected pose adapter/check files originate from Derrick's vision branch at `aa626e16f025a93b58dcd569d5c84b47b9885b97`; this is not a merge of his entire UI/config branch. The pinned package patch adds sampled images to the existing camera, avoiding competing camera sessions. See [vision tracking](VISION_TRACKING.md).

`server/live/` owns provider orchestration, `src/live/` owns the wire/client, `src/voice/LiveAudio*` owns native PCM, `src/session/LiveCoachScreen.tsx` owns integration lifecycle, and `src/vision/checks/registry.ts` owns sequence-derived form support. The renderer's six components and composition policy remain authoritative. Generic shared catalogs/cues stay empty for unconfigured consumers. Legacy HTTP text and recognition/TTS development panels remain separate diagnostics and are unmounted while the live route is active.

## Integration verification update

Derrick's PR #14 is integrated in this branch; see [VISION_INTEGRATION.md](VISION_INTEGRATION.md). Reusable emulator/device checks are documented in [DEVICE_SMOKE_TESTS.md](DEVICE_SMOKE_TESTS.md). The latest checks pass 122 regression tests plus lint, both TypeScript configurations and Android export. A synthetic spoken wall-angel request passed through the configured Gemini and OpenAI models and renderer compiler (two groups, nine seconds, 20 audio chunks). The native-audio endpoint emitted `voiceActivity.type: ACTIVITY_END` before the tool call while omitting optional transcription `finished`; both the observed field and SDK-declared field are now handled. This confirms the protocol path, not physical audio quality.

Phone/backend clock synchronization precedes live initialization. Local playback/form timestamps remain local; only their transport copies use the backend clock. Absolute action expiry is preserved to reject delayed actions; the comparison includes synchronization uncertainty rather than trusting the midpoint estimate alone. Audio limits account for both pending PCM decoding and decoded playback, and interruption resets their generation together.
