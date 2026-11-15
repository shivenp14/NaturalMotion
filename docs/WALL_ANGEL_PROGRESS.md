# Wall-angel rig proof

Shiven and Derrick selected the wall angel as the first movement family. This is an isolated development preview inside the anatomy viewport, not the final session UI or a registered agent capability.

## Implemented

- Inspect rest, goalpost, midpoint and upper poses on the actual anatomical rig.
- Play one cycle: rise, optional hold, return to goalpost; pause/resume and reset to rest.
- Author mirrored clavicle, scapula, upper-arm, forearm and hand rotations. Spine/pelvis/neck stay at rest. This is an illustrative kinematic animation, not a validated biomechanical simulation.
- Render on demand when idle; animate by frame delta while playing. A long idle/background frame is capped rather than skipping the demonstration.
- Display a translucent wall reference. No wall-contact solver or contact verification is implemented.
- Offer educational trapezius and side/rear-deltoid highlighting separately from the broader region controls. This provisional mask is not measured activation or an exhaustive muscle-involvement map.

The preview controls are under `__DEV__` and deliberately stay inside `src/anatomy/`; Roland's session/UI files and Derrick's vision files are unchanged. The agent-facing catalog remains empty, and `MovementSequence`/`PlaybackState` integration is still pending.

## Bounded preview parameters

| Parameter | Allowed range | Default |
| --- | --- | --- |
| `topAngleDeg` | 120–150 | 145 |
| `travelSeconds` | 2–5 per direction | 3 |
| `holdSeconds` | 0–2 | 1 |

These are rendering settings, not prescribed human range-of-motion targets. Development buttons expose 125/145 and 3/5 seconds. Parameter changes return to goalpost; Play starts a new cycle except that Resume continues a paused cycle. Rest restores the original local bone quaternions without accumulating rotations. There is currently a direct change from rest into goalpost; a polished setup transition is still needed.

## Asset correction

The original auto-rig had abrupt weight changes between neighboring vertices and allowed medial torso origins to follow the arms, causing visible tearing. The app now loads `body-smoothed.glb`, generated offline from the preserved original `body.glb` by:

```bash
node --import tsx scripts/prepare-anatomy-weights.mjs
```

The adapter smooths connected-face weights and adds continuous torso-origin anchors for trapezius, lats and pectoralis major. Only joint indices/weights change; geometry, part IDs, bones and bind matrices are preserved. Smoothing is not computed on the phone. The original and adapted files are each about 4.4 MB; Android export bundles only the adapted file. Attribution and CC BY-SA adaptation notices are in `assets/models/heatsy/`.

## Verification

- `npm run check`: lint, app/test typechecks and all 16 tests pass.
- Tests cover cycle boundaries/invalid inputs, unchanged geometry/bind matrices, normalized weights, symmetry, finite bounded posed vertices, camera-view independence, exact reset, source-cache isolation, anchored medial torso vertices and the focus mask.
- `npm run export:android`: succeeds and includes the adapted GLB.
- Android 17 / API 37 emulator with Expo Go: inspected goalpost, midpoint and upper poses, front/back views, playback completion at goalpost, pause and resume, and range/speed button changes. Original rest pose also loads on a fresh app launch.
- An emulator quick-boot restoration during the interrupted test left a blank GL surface; restarting Expo Go and reopening the Metro URL recreated the model. This test does not establish physical-device lifecycle reliability or sustained frame rate.

## Remaining work before catalog registration

1. Refine the visible shoulder/armpit seams and compressed muscle shapes, especially near the upper endpoint. The weight correction improves the first attempt but does not make deformation production-ready.
2. Review the motion and final educational muscle map together; add a clean setup transition.
3. Agree the executable component definition and actual observable checks with Derrick and Roland. Front-view landmarks alone do not establish wall contact, scapular mechanics or lumbar arching; unavailable checks must remain `not_observable`.
4. Add validated sequence execution and phase/completion events through the existing shared contracts, then register the component.
5. Verify the physical Android presentation phone and custom development build.

Movement reference: [UCSF upper-body exercise guide](https://sportsrehab.ucsf.edu/sites/g/files/tkssra10961/files/doc/Upper_Body_Stretches_Nov2025.pdf). This prototype is not an individual treatment recommendation.
