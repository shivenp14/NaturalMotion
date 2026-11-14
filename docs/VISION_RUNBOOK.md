# Vision spike runbook: phone test

For [Derrick 1/3](../README.md) — prove Android camera and pose feasibility.
This document covers the cloud build path only. You do not need Android Studio or the Android SDK.

## What you need

- The Android presentation phone.
- A free Expo account.
- Your laptop, with this repository and `npm ci` complete.
- The phone and the laptop on the same Wi-Fi.
- Permission on the phone to install an app from a browser.

## What this repository already contains

- `react-native-pose-detection` (MediaPipe) in `package.json`.
- Its config plugin in `app.json`, with `model: "lite"`.
- The route `/vision-debug`, which opens the temporary debug view.
- No movement is registered in `src/shared/catalog.ts`. The debug view is not part of the app flow.

## Step 1 — Link the repo to one Expo project (once)

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` writes `extra.eas.projectId` into `app.json`. That file is shared. Tell the team before you commit it.

Check the project slug on the Expo website. It must equal `app.json` `"slug": "naturalmotion"`.
If the team already linked a project, use that one. Never create a second project for this repo.

## Step 2 — Build the development APK

```bash
npx eas-cli@latest build --platform android --profile development
```

Expect these prompts on the first Android build:

```text
Generate a new Android Keystore?    → Yes
```

The build downloads the pose model, so it needs network on the build machine. It does this for you.

When the build ends, the terminal prints a URL and a QR code.

## Step 3 — Install on the phone

1. Open the build URL on the phone, or scan the QR code with the phone camera.
2. Allow "install unknown apps" for the browser, once.
3. Install the APK.

The app is now on the phone. It shows a white screen until Metro sends it JavaScript.

## Step 4 — Start Metro

```bash
npm start
```

Scan that QR code **inside the installed NaturalMotion app**.
Do not scan it with Expo Go. Expo Go does not include the pose module and fails with "native module not found".

After the first connection, TypeScript changes reload in about one second. You do not rebuild the APK.

Rebuild only when a dependency with native code changes.

## Step 5 — Run the test sequence

Open the debug view from the app's development panel, or enter the route directly.

Prop the phone at desk height, front camera, facing you. Do these in order:

| # | Test | How | Record |
| --- | --- | --- | --- |
| 1 | Framing | Sit at about 1.2 m, then 1.8 m, then 2.5 m. Keep head to elbows in frame. | The distance where all required landmarks stay above the visibility threshold. |
| 2 | Clean hold | Goalpost arms: elbows bent 90°, upper arms to shoulder height. Hold 3 seconds. 3 times. | `elbowAboveShoulder`, `elbowSpread`, `earToShoulder`, and the fps. |
| 3 | Deliberate mistake | Same position, drop both elbows about 15 cm. Hold 3 seconds. 3 times. | The same numbers. |
| 4 | Hidden joint | Cover one elbow, or turn 30° away. | That the status becomes `not_observable`, never `aligned`. |

Acceptance for this spike:

- fps of 15 or more, sustained.
- Required landmarks present in 90% of frames or more during the hold.
- Clean and mistake separates by at least 3× the shake band.

Record a screen video of one clean hold and one mistake. This is the checkpoint evidence.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Native module not found" | Opened in Expo Go | Open the installed app, not Expo Go |
| Metro cannot connect | Different Wi-Fi, or the firewall blocks port 8081 | Same network; allow Node through the firewall; try `npx expo start --dev-client --tunnel` |
| "Install blocked" | Unknown sources disabled | Allow installs for the browser |
| Build stops: project not linked | Step 1 skipped | `npx eas-cli@latest init` |
| Build stops: model download | Network on the build machine | Retry the build |
| Camera shows a permission prompt and stops | Permission denied | Allow the camera, then relaunch |
| Body points jump between frames | Low light, or the body is too close | Change the setup, not the threshold |

## What you must not do

- Do not use Expo Go for this project.
- Do not edit `android/` or `ios/`. Those folders are generated and ignored by git.
- Do not register a movement in `src/shared/catalog.ts` until Shiven confirms the rig can animate it.
- Do not treat `not_observable` as a pass.
- Do not change a check threshold to make a bad setup pass.

## Handoff after the test

Send the team these four facts. They unblock the next two issues:

```text
componentId          e.g. goalpost_arm_raise
requiredLandmarks    the names the debug view prints
supportedCheckIds    e.g. goalpost_arms_elbow_height
cameraView           one sentence: distance, height, view, clothing
```

Also send: the screen video, the numbers from step 5, and any blocker.
