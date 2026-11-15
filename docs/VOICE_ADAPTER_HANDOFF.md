# Native voice adapter handoff

Current live integration and November 15 verification are documented in [LIVE_COACH_HANDOFF.md](LIVE_COACH_HANDOFF.md). The earlier diagnostic path and checkpoint below are retained for reference; physical-phone audio acceptance remains pending.

Implemented from the supplied `naturalmotion-worker3-voice-adapter-local` draft, adapted to the current validated `AgentReturn` contracts. The supplied draft expected the older `{ speech, sequence? }` response; that format is not accepted.

## Installed integration

- `expo-speech ~58.0.4` supplies TTS; `expo-speech-recognition ^58.0.1` supplies native recognition. Both were installed through `npx expo install`, with package-lock.json preserved and updated.
- The speech-recognition plugin in app.json configures native microphone/speech permissions and Android speech service visibility. Coordinate these native dependency/config changes with Derrick before integrating his build changes.
- `DeviceVoiceAdapter` accepts small recognition/speech drivers, resolves listening on native startup and speech on `onDone`, and cancels pending permission/start/speech operations. Shutdown blocks new audio until the native bridge finishes releasing the microphone.
- `expoVoice.native.ts` binds the device modules. `expoVoice.ts` is the web fallback. Native modules load only when the Android test is started, allowing the shell to load without them; a missing module is reported in the panel.
- `TurnCoordinator` validates the complete action batch before dispatch. Speech uses text or reviewed local cues; sequences go to `onSequence`; movement/session controls require `onPlaybackAction`. Dispatch callbacks are synchronous. Pause/stop ends the voice loop. Provider or native errors stop the loop and surface an error rather than automatically speaking over uncertain audio state.
- Listening resumes after TTS finishes. Silence retries four times with bounded backoff, then stops. Cancellation aborts provider requests and ignores late responses even when the provider ignores the abort signal.

The session screen includes `VoiceDevPanel` only in development. It is an isolated local echo test, not a model backend or production coaching flow. It stops on app backgrounding and unmount. It does not register any movement. Audio may be processed online by the device's selected recognition service; this is not an offline-only guarantee. No camera data is passed to recognition or the echo agent.

## Build and test on Android

Expo Go cannot run this recognition module. Rebuild and install the development client using the team's configured EAS project:

```sh
npx eas-cli@latest build --platform android --profile development
npm start
```

Then:

1. Start the development voice test and grant microphone/speech permission.
2. Say a short request from the intended movement position; confirm one final transcript and one spoken echo.
3. Confirm recognition does not hear its own TTS, and listening resumes after playback.
4. Stay silent through repeated recognition timeouts; confirm the test eventually stops with a useful message and can restart.
5. Test denied/revoked permissions, a missing recognition service, stop while permission/start/TTS is pending, background/foreground, and rapid stop/restart.
6. With Derrick and Shiven, repeat while real camera processing and anatomy rendering are active.

## Verification limits

Automated tests use fake native drivers. `npm run check` verifies lint, TypeScript and lifecycle/contract tests; `npm run export:android` verifies JavaScript bundling. Neither proves native compilation, phone permissions, service availability, microphone/TTS timing, or combined camera/graphics performance. The native Android debug APK has built and installed successfully, and the user has confirmed audio capture works. The live-provider and emulator camera/graphics path now passes; physical-phone live audio and sustained combined-load acceptance remain pending.

References: https://docs.expo.dev/versions/v58.0.0/sdk/speech/ and https://github.com/jamsch/expo-speech-recognition
