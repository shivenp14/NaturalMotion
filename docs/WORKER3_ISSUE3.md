# Worker 3 — Issue #3 foundation and handoff

This document records an initial implementation **spike**, not a completed voice integration.
It follows the repository's empty-catalog rule and never registers unverified exercises.

## Selected architecture

- **Conversation:** chained text-based assistant, not full-duplex GPT Live.
- **Model:** OpenAI Responses API with strict JSON schema, called from a small development server.
  Default model `gpt-4.1-mini` (override `OPENAI_MODEL`).
- **Agent output:** short spoken explanation plus optional `MovementSequence`. A candidate
  sequence is checked against the existing `validateSequence` before any renderer call.
- **Voice plan:** Android speech recognition using `expo-speech-recognition` SDK 58,
  and text-to-speech using `expo-speech` SDK 58. Hands-free half-duplex turn
  orchestration is implemented and tested with a fake `VoiceAdapter`.
- **No always-on video upload:** Worker 1 will send structured `FormEvent` observations
  in Issue #6. Do not call the LLM on every camera frame.

## Already implemented in this branch

- `src/agent/plan.ts`: strict runtime conversion of model-generated parameter pairs
  to verified `MovementSequence` instructions. Rejects duplicates and unsupported values.
- `src/agent/httpAgent.ts`: mobile transport through `EXPO_PUBLIC_API_BASE_URL`.
- `server/agentServer.ts`: local **development-only** OpenAI API bridge with credentials
  read from server process environment. It uses the repo's actual catalog, not a catalog
  asserted by the client. It refuses to invent components if the catalog is empty.
- `src/voice/turnCoordinator.ts`: start → listen → stop recognition → call agent →
  validate → speak → resume listening, with cancellation and duplicate-turn gating.
- `src/session/AgentDevPanel.tsx`: text request UI visible only in development.
- Protocol and turn coordination tests using synthetic fixtures.

## Local test procedure

```sh
npm ci
npm run check

# In one terminal on your laptop, with the model key only on the laptop:
export OPENAI_API_KEY="YOUR_KEY"
export AGENT_HOST="0.0.0.0"  # dev only, on a trusted LAN
node --import tsx server/agentServer.ts

# On the Expo development machine:
# .env contains EXPO_PUBLIC_API_BASE_URL=http://YOUR_LAN_IP:8787
npm start
```

Check `http://YOUR_LAN_IP:8787/health`. The developer-only app panel can submit
text utterances. **With the catalog empty**, the server returns an explicit
'no movements enabled' response without calling OpenAI. This is intentional.
A sequence-generation test succeeds using the *test-only* fixture, not a supported exercise.

For any browser-based testing, use a same-origin dev proxy or add controlled CORS
for the development origin; the current server is intended for native Android
HTTP fetch and does not implement cross-origin browser access.
An Android APK build and actual device test have not been performed by this branch.

## Native audio feasibility checkpoint (pending Derrick's build coordination)

1. Ask Person 1 to coordinate package/lockfile and Expo config changes for
   `expo-speech` and `expo-speech-recognition` compatible with SDK 58:
   `npx expo install expo-speech expo-speech-recognition`.
2. Add the speech-recognition config plugin, permissions, and rebuild the
   Android development client (not Expo Go).
3. Implement `VoiceAdapter.listen(callback)`: it resolves when recognition is
   started and invokes the callback **once per final utterance**. Handle permission
   rejection, timeouts, service errors, and silence.
4. Implement `VoiceAdapter.speak(text)`: it must await TTS completion (not
   merely calling `Speech.speak`, which returns void). Implement stop/cancel
   so the assistant's speech cannot feed recognition.
5. Verify on the presentation phone at the user's movement distance, including
   recognition and playback while the camera + 3D view are active.

This has **not** been verified on hardware. Do not mark the audio checkpoint complete.

## Team integration contracts

- **Shiven (Person 2):** supply the implemented component `id`, exact numeric parameter
  keys and ranges, muscle region IDs, and playback events. Update
  `src/shared/catalog.ts` only after the rig can execute it. The server must be
  restarted after registering the component.
- **Derrick (Person 1):** supply `FormEvent` check IDs, status meanings, supported
  phases, and observation freshness handling. A form event is not a diagnosis.
- **Roland (Person 3):** own `AgentAdapter`, voice adapter, feedback action policy,
  `TurnCoordinator`, and `SessionProvider` integration. Native audio and
  meaningful live form feedback are the next-phase tasks.

## Critical boundaries

- No unauthenticated public deployment of `server/agentServer.ts`.
- Never place model API keys in `EXPO_PUBLIC_*` or commit credentials.
- No catalog item means no movement is executable.
- The server validates instructions, and the mobile session validates again.
- No diagnosis, injury treatment, invented muscle activation, or unsourced
  movement-safety claims.
- Build a real Android audio test before calling Issue #3 complete.

## References

- [Issue #3](https://github.com/shivenp14/NaturalMotion/issues/3)
- [Expo SDK 58 speech](https://docs.expo.dev/versions/v58.0.0/sdk/speech/)
- [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
