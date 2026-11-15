# Agent backend and voice integration

The backend connects text or recognized speech to a server-side OpenAI Responses API request. PR #15 reports a successful live provider request on its original branch. The merged anatomy integration is verified with a mocked provider; a live movement-generation request still needs server credentials in this checkout.

## Local setup

Use Node 24. Copy `server/.env.example` to `server/.env` and configure `OPENAI_API_KEY` there. `OPENAI_MODEL` defaults to `gpt-6-astra`; select an available Responses/Structured Outputs model for your account. This file is ignored by Git. Never use an EXPO_PUBLIC variable for provider secrets.

Start the service:

```sh
npm run server
```

`GET /health` reports whether a provider key is configured (not whether it is valid). `POST /agent/respond` accepts the transcript, client catalog, current sequence, and optional cues. Only server-owned capabilities/cues are supplied to the model. Invalid session context and unsupported actions are rejected. No audio or camera footage is transmitted by this endpoint. Responses use `store: false`; review provider data policies separately before deployment.

For the Android emulator, create/update the app's root `.env` with:

```sh
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001
```

Restart Metro after changing app environment configuration. Use **Start agent test** in the development voice panel. **Start echo test** remains available for isolating microphone/TTS problems. The agent path sends recognized transcripts to the backend, validates the returned actions, speaks the reply, and resumes listening. Accepted sequences now play through the anatomical renderer. Pause holds the current pose; stop clears the sequence. Indexed modification/replay are excluded from the configured provider schema and rejected if returned anyway. Ask for a complete replacement sequence to change timing or range.

The local service defaults to `127.0.0.1:3001`. For a physical phone, use a reachable HTTPS endpoint or explicitly bind a trusted development LAN interface via `AGENT_HOST`, then set the app URL to that host. This service is for local development: add authenticated sessions, rate limiting, and HTTPS before public deployment. It limits concurrent requests and body size, bounds provider timeouts, propagates disconnect cancellation, and omits provider error details and transcripts from logs.

## Current boundaries

The app and server explicitly share `anatomyAgentCapabilities`: six verified left/right shoulder-elevation, elbow-flexion and shoulder-rotation components, plus `validateUpperBodyComposition`. The shared default catalog remains empty for unconfigured consumers. Cues and camera checks remain empty; the registered components do not claim form evaluation. The provider receives renderer-owned initial-pose, coordination, continuity and timing guidance. Every output still passes domain validation on the backend, client, session and renderer. Sequences follow Shiven’s `id`/`stepIndex`, catalog-defined numeric parameters, and simultaneous command groups; see [contract alignment](WORKER3_CONTRACTS.md). The server is stateless: each turn receives current sequence context, but no prior conversation transcript. Form-event explanations remain in the deterministic cue policy and are not accepted as arbitrary client observations by this transcript endpoint.

## Acceptance

1. Health reports `ready: true` after configuring a key.
2. Speak a greeting; confirm a model response instead of an echo, then automatic listening resumes.
3. Ask for an unsupported lower-body movement; confirm a clear limitation and no playback.
4. Stop during an in-flight model request; confirm no late speech.
5. Unavailable service, invalid response, timeout, and provider failures produce a visible error and stop listening.
6. Use the development text panel to request a wall-angel demonstration. Confirm validated groups appear and the model plays to completion. Camera feedback remains a later integration.
7. On the presentation phone, repeat using speech, verify an audible response and automatic listening resumption, then stop/pause. Do not count displayed text as proof of audible TTS.

Automated tests cover HTTP request handling, cancellation/timeouts, provider response/refusal handling, and schema/domain validation with a mocked provider. They do not demonstrate live provider access.

## Text-only smoke test (no device required)

With the backend running and a valid key configured:

```sh
npm run test:agent
npm run test:agent -- "Show a smaller wall-angel demonstration, taking five seconds each way."
npm run test:agent -- --expect-no-movement "Demonstrate an ankle rotation only; do not substitute an upper-body movement."
```

The script calls the real HTTP endpoint, validates its actions, and compiles each generated sequence with the renderer policy. It fails if a movement request produces no sequence, or if `--expect-no-movement` receives one. `AGENT_TEST_BASE_URL` overrides the host-side default `http://127.0.0.1:3001`. It never substitutes canned output.

For emulator testing start Metro with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001 npm start -- --localhost --port 8082 --clear`, forward port 8082 if needed, and open the combined development client. The development text panel displays replies and validated JSON without using the microphone or TTS. Use the text and voice panels separately. The final session button/UI remains a separate milestone.

See [integration verification](AGENT_ANATOMY_INTEGRATION.md) for results and remaining acceptance.
