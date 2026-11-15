# Agent backend and voice integration

The next stage after the verified device echo test connects recognized text to a server-side OpenAI Responses API request and speaks the validated response. OpenAI is the initial configurable implementation; it has not been verified against a live account yet.

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

Restart Metro after changing app environment configuration. Use **Start agent test** in the development voice panel. **Start echo test** remains available for isolating microphone/TTS problems. The agent path sends recognized transcripts to the backend, validates the returned actions, speaks the reply, and resumes listening. It uses the session provider for accepted sequences and stop/reset. Playback modification/replay still requires the anatomy renderer and controller; the panel reports that these are unavailable.

The local service defaults to `127.0.0.1:3001`. For a physical phone, use a reachable HTTPS endpoint or explicitly bind a trusted development LAN interface via `AGENT_HOST`, then set the app URL to that host. This service is for local development: add authenticated sessions, rate limiting, and HTTPS before public deployment. It limits concurrent requests and body size, bounds provider timeouts, propagates disconnect cancellation, and omits provider error details and transcripts from logs.

## Current boundaries

The live catalog and cues remain empty. The model should explain that movement demonstrations are unavailable rather than invent an exercise. Register the same verified capabilities and trusted renderer composition policy on server and app before testing sequence generation. Sequences follow Shiven’s `id`/`stepIndex`, catalog-defined numeric parameters, and simultaneous command groups; see [contract alignment](WORKER3_CONTRACTS.md). The server is stateless: each turn receives current sequence context, but no prior conversation transcript. Form-event explanations remain in the deterministic cue policy and are not accepted as arbitrary client observations by this transcript endpoint.

## Acceptance

1. Health reports `ready: true` after configuring a key.
2. Speak a greeting; confirm a model response instead of an echo, then automatic listening resumes.
3. Ask for an unavailable movement; confirm a clear limitation and no playback.
4. Stop during an in-flight model request; confirm no late speech.
5. Unavailable service, invalid response, timeout, and provider failures produce a visible error and stop listening.
6. After anatomy/vision integration, verify sequence generation, supported spoken modifications, and grounded feedback on the presentation phone.

Automated tests cover HTTP request handling, cancellation/timeouts, provider response/refusal handling, and schema/domain validation with a mocked provider. They do not demonstrate live provider access.
