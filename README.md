# NaturalMotion

An Android-first, hands-free movement coach with one anatomical model, parameterized movement sequences, and camera-grounded form feedback.

## What is ready

- Expo SDK 58 / React Native 0.88 / React 19 / TypeScript starter with Expo Router.
- A native landing/session shell and a rigged anatomy viewer with graphite finish, view controls, and educational region highlighting.
- Shared movement, playback, pose, and form-feedback contracts.
- Runtime sequence validation and feedback freshness helpers with protocol tests.
- Separate team workspaces, a shared session provider, development-build profiles, and CI checks.

**The movement catalog is intentionally empty.** The anatomy asset and visual viewer are integrated, with a [development-only wall-angel rig proof](docs/WALL_ANGEL_PROGRESS.md). Sequence playback, pose estimation, microphone capture, and agent integration are not connected yet. The session button stays disabled until those integrations exist. The team selected wall angels as the first movement family; finish deformation review and agree its component/check definitions before registering it.

## Quick start

Use Node 24 (`nvm use` if you use nvm) and npm. Commit and use `package-lock.json`.

```bash
git clone https://github.com/shivenp14/NaturalMotion.git
cd NaturalMotion
npm ci
npm run check
```

### Fast shell preview

```bash
npm run start:go
```

Open the QR code in an **SDK 58-compatible Expo Go** installation on Android. Keep the computer and phone on the same network. If the app-store Expo Go version does not match, use a matching Android client from Expo or the development-build path below. Expo Go is for this starter shell; future native pose/audio/graphics modules may require a custom build.

For a browser-only shell preview, use `npm run web`. Browser success does not validate Android hardware integrations.

### Android development build: preferred integration path

One team member should configure the Expo project and distribute the resulting development APK to the others:

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile development
```

The first configuration links the project to the team's Expo account and writes its real project ID. No account, credentials, or project ID is preconfigured in this repository. Review and commit configuration changes before teammates build. Cloud build availability and turnaround depend on the account/service.

Install the development APK on the Android phone, then start Metro:

```bash
npm start
```

Open the development client and connect to the Metro URL/QR code. After changing native dependencies or config plugins, rebuild the APK; JavaScript changes normally use Metro without a native rebuild.

Alternatively, with the Android SDK, platform tools, and a device configured for local development:

```bash
npm run android -- --device
```

This generates native files and compiles locally. Generated `android/` and `ios/` folders remain ignored; customize native behavior through Expo configuration/plugins.

**Presentation device: Android 17, exact model still to be recorded.** The OS version alone does not validate camera, speech, pose-library compatibility, or performance. Test on the actual device. Keep SDK defaults for Android build targets until a verified integration requires a change.

## Team ownership

| Person | Work here | Deliver to the others |
| --- | --- | --- |
| 1: Mobile + vision | `src/vision/`, app configuration, native dependencies | `PoseObservation`, component-specific `FormEvent` output |
| 2: Anatomy + movement | `src/anatomy/`, `assets/models/` | Sequence playback, `PlaybackState`, supported component capabilities |
| 3: Agent + voice + UI | `src/agent/`, `src/voice/`, `src/session/`, `src/ui/` | Validated sequences, hands-free turns, integrated session flow |

Person 1 coordinates dependency/config/lockfile edits. Person 3 coordinates shared contracts after agreement with the team. Keep routes in `src/app/`; put feature implementations outside that directory.

### Main integration points

- `src/shared/contracts.ts`: cross-track TypeScript types; timestamps use Unix milliseconds.
- `src/shared/catalog.ts`: real executable component definitions; initially empty.
- `src/shared/validateSequence.ts`: validate untrusted agent output against registered parameter ranges before playback.
- `src/shared/formEvents.ts`: reject events from the wrong sequence/step, unsupported checks, and old/future observations. The vision owner must also gate checks by supported phases and validate adapter output.
- `src/session/SessionProvider.tsx`: `acceptSequence`, `phase`, `sequence`, and `reset`. Extend session coordination here rather than creating disconnected stores.
- `src/anatomy/AnatomyViewport.tsx`: graphite anatomy viewer. Sequence playback and its reserved callback remain the next integration step; see `docs/ANATOMY_PROGRESS.md`.
- `src/vision/types.ts`: camera adapter and form-evaluator boundaries.
- `src/agent/types.ts` / `src/voice/types.ts`: service and audio adapter boundaries.

The fixture in `tests/contracts.test.ts` is synthetic test data. It is not a supported exercise and is not registered in the application catalog.

### When choosing the first movement

1. Person 2 proves the rig can execute one component and highlight the intended region.
2. Person 1 proves one useful form check is observable from a prescribed camera position.
3. Agree on component ID, parameter meanings/limits, landmark names, image mirroring, and check IDs.
4. Register that component, implement the renderer and evaluator, then give the catalog to the agent.
5. Connect voice, playback, and real observations on the Android phone before expanding coverage.

Camera preview alone is not pose estimation. Do not assume `expo-camera` exposes the raw frame pipeline required by a chosen pose library. Use `npx expo install <package>` for dependencies and verify each native package against SDK 58 before committing to it. The anatomy viewer uses React Three Fiber and Expo GL; camera and voice packages remain deferred until their integration paths are selected.

## Configuration and secrets

Use `.env.example` as the configuration reference. Local `.env` files are ignored. `EXPO_PUBLIC_*` values are public app configuration; never put long-lived model/speech API secrets there. Person 3 should choose and implement the backend/provider integration separately.

When connecting a physical phone to a laptop service, use a reachable LAN address or HTTPS endpoint. `localhost` on the phone refers to the phone itself. No backend service is included or started by this scaffold.

## Checks

```bash
npm run check             # lint, typecheck, contract tests
npm run export:android    # verify Android JavaScript bundling; not a native APK build
npx expo install --check  # verify SDK dependency versions
npx expo-doctor           # project diagnostics
```

CI runs checks and the Android JavaScript export. Native compilation and Android 17 device verification remain separate checks.

At scaffold handoff, lint, both TypeScript checks, all six contract tests, Android JavaScript export, and all 20 Expo Doctor checks passed. A native APK has not been built or installed on the presentation phone.

The initial npm audit reports eight moderate dependency findings through `minimatch` in Expo fingerprinting and TypeScript ESLint tooling. No high or critical findings were reported. Review upstream-compatible updates; do not use a forced Expo downgrade to clear the report.

## Planning documents

- [Product brief](docs/PRODUCT_BRIEF.md)
- [Three-person implementation plan](docs/TEAM_PLAN.md)
- [Interactive team build timeline](docs/team-build-timeline.html)
- [Anatomy proof progress](docs/ANATOMY_PROGRESS.md)

Start with one integrated sequence, one highlighted region, and one real form correction. Acceptance is three consecutive complete runs on the presentation phone, including a spoken request that visibly changes a permitted movement parameter.

## Official setup references

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)
- [Expo Router installation](https://docs.expo.dev/router/installation/)
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Build setup](https://docs.expo.dev/build/setup/)
