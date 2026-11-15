# Agent and anatomy integration checkpoint

PR #12 was merged into `main` and `main` merged into `roland/voice-agent-foundations` for PR #15. This connects the movement and agent foundations without replacing the final UI work.

## Connected behavior

- The app root and server entrypoint use one trusted `anatomyAgentCapabilities` configuration: six actual left/right shoulder-elevation, elbow-flexion and shoulder-rotation components plus the renderer's `validateUpperBodyComposition` policy.
- The model receives initial-pose, continuity, joint-coordination and timing guidance. It composes numeric commands in simultaneous timed groups; there is no exercise-name dispatch in the executor.
- Returned instructions are validated by the backend, client, session and renderer. Only a complete valid response is accepted by the text test. Unsupported/discontinuous movements cannot fall back to a canned demonstration.
- The development text panel displays replies and optional validated JSON, then sends accepted sequences to the same anatomical model. Playback reports feed the session; pause/resume and clear are available. A new complete sequence can change timing or range.
- Indexed modification/replay are excluded from this configured service's schema and rejected if returned anyway. Their generic protocol types remain for later controller integration.
- Camera metadata/checks and reviewed feedback cues remain unconfigured. The generic shared catalog remains empty; the app/server explicitly opt into the verified anatomy capabilities. No observation, measured activation or clinical capability is invented.

## Verification — November 15, 2026

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm run check` | Passed: lint, app/Node typechecks, 60 tests | Existing anatomy/voice tests plus real-catalog HTTP/client/compiler integration with a mocked provider |
| `npm run export:android` | Passed | Combined Android JS bundle, including the adapted local GLB |
| Combined native debug APK | Built and installed | Graphics, native recognition and TTS modules compile together |
| Android 17 / API 37 emulator, native development client | Passed | Text panel loads, request reaches backend and shows HTTP 503 when key is absent; no generated movement is accepted |
| Native-client wall-angel movement lab | Passed | Model renders, composed reference playback reaches completion; this is authored reference data, not live AI generation |
| Native voice initialization and stop | Passed | Permission granted; subsequent start reached `listening`, Stop returned to `idle` |
| `npm run test:agent` against local backend | Blocked: HTTP 503 | No `server/.env` or environment provider key was configured; live generation is not proven |

These emulator checks were on one 1080×2400 Android 17 emulator. They do not verify actual microphone distance, audible TTS or physical-device performance. On first use, the microphone permission dialog stopped the development voice test; starting again after permission was granted reached listening. Speech content/recognition and audible output were not tested in this run.

Local native-build setup initially selected Intel-only CMake/Ninja executables. The successful build used native ARM CMake 3.24.4, a temporary universal Ninja 1.13.2 binary, and a build PATH excluding the incompatible executables. A temporary Gradle init script selected that CMake version; no generated native source or machine-specific tool paths were committed. Normal Android builds need working native build tools on the host.

## Next tests

### Live provider — no device needed

1. Configure `OPENAI_API_KEY` and an account-available `OPENAI_MODEL` in ignored `server/.env` using `server/.env.example` as the template.
2. Restart `npm run server`. `/health` reporting `ready: true` means a key is present, not that it is valid.
3. Run `npm run test:agent`. Require a generated sequence that passes renderer compilation; a conversational answer alone is not success.
4. Run the smaller/slower and unsupported lower-body requests documented in [backend setup](AGENT_BACKEND_HANDOFF.md).
5. Repeat a supported request in the development text panel and confirm actual playback and phase/completion reports. Try pause/resume, clear, and a new timing/range request.

### Android emulator

The combined APK is installed as `com.shivenp14.naturalmotion`. This session used Metro on port 8082, `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001`, and backend port 3001. Start the configured backend and Metro, forward Metro's port if needed, and connect the development client. Use the development text panel near the top; the separate voice panel is below the model. Expo Go can show the text/anatomy surface but cannot test the custom native recognition module.

### Presentation phone

Install a combined development APK containing both graphics and speech modules. Use a phone-reachable backend address instead of emulator-only `10.0.2.2`. Verify a spoken request from stretching distance, a correct transcript, an audible reply, listening resumption without recognizing its own TTS, and stop during a pending request. Then repeat with a generated sequence on the anatomical model. Do not run the text and voice test panels simultaneously.

Agree with Derrick on observation/check metadata and with Shiven on executable movement semantics before claiming camera-based coaching. Full final UI, camera feedback and sustained combined-load performance remain later integration work. Issue #3 remains open pending its live movement-generation, phone audio and teammate handoff acceptance.
