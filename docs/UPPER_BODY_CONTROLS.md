# Upper-body control preview

Branch: `shiven-upper-body-controls`, based on the anatomy-viewer branch. No new native
modules, routes, model files, lower-body controls or finger controls are introduced.

## Available channels

`upperBodyControls` is the single registry used by pose validation, the preview catalog and
the movement lab. There are 24 channels: nine per arm and three each for torso and neck.
Each command uses `fromDeg` and `toDeg`; timing belongs to the simultaneous group.

| Component suffix (left_/right_ prefix) | Setting | Rendering bounds |
| --- | --- | --- |
| shoulder_elevation | Arm elevation from arms-down | 0–150° |
| elbow_flexion | Elbow bend from straight | 0–110° |
| shoulder_external_rotation | Existing shoulder rotation setting; neutral 90 | 60–120° |
| shoulder_plane | Sideways 0, forward 90, slightly behind negative | −20–90° |
| shoulder_shrug | Lower negative, shrug positive | −8–12° |
| shoulder_reach | Pull back negative, reach forward positive | −12–18° |
| forearm_rotation | Palm rotation; mirrored sign per arm | −60–60° |
| wrist_flexion | Hand bend around its local transverse axis | −35–35° |
| wrist_deviation | Side bend, mirrored per arm | −20–20° |

| Component | Setting | Rendering bounds |
| --- | --- | --- |
| torso_flexion | Forward positive / backward negative | −15–25° |
| torso_rotation | Turn toward model left positive / right negative | −30–30° |
| torso_side_bend | Lean toward model left positive / right negative | −20–20° |
| neck_flexion | Nod forward positive / backward negative | −20–25° |
| neck_rotation | Turn toward model left positive / right negative | −45–45° |
| neck_side_bend | Tilt toward model left positive / right negative | −20–20° |

These are authored rig settings, not human range-of-motion measurements, exercise prescriptions,
or claims of accurate biomechanics. The wider envelope is exploratory and needs phone visual QA.

## Composition and constraints

The existing six IDs remain compatible. Programs still start at the calibrated goalpost pose:
arm elevation 90, elbow flexion 90, shoulder rotation 90; new channels are zero. Omitted channels
retain their values. `relaxedUpperBodyPose()` provides an arms-down target with elevation and
elbow flexion zero. The original imported asset rest pose remains available through `rig.reset()`.

The renderer revalidates external input against `upperBodyPreviewCatalog` and
`validateUpperBodyComposition`. It rejects unknown IDs, nonfinite/out-of-range angles,
duplicate channel writers, discontinuous starts, and unsupported combinations:

- Per arm, elevation plus elbow flexion cannot exceed 190°.
- Wrist combination budget: `abs(flexion)/35 + abs(deviation)/20 <= 1.5`.
- Torso and neck each have a combination budget of 1.5: sum each angle's magnitude divided
  by its corresponding positive/negative bound. This restricts stacked extreme rotations.
- Travel remains 2–5 seconds and hold 0–2 seconds per group.
- Shared protocol limits remain unchanged: up to 12 commands per group and 32 steps.

These constraints are convex, so shared interpolation between accepted endpoints stays in bounds.
A step moving closer to the canonical start pose, using normalized channel distance, reports
`returning`. Other travel reports `moving`; hold/completion and pause events retain their behavior.
The wall-angel example still emits six commands per step. `createUpperBodyPoseReference` builds
an out/hold/return preview for up to 12 changed channels; it rejects larger groups explicitly.

Example: turn the torso while nodding the head, then return:

```ts
const pose = initialUpperBodyPose();
pose.torso.rotationDeg = 20;
pose.neck.flexionDeg = 10;
const sequence = createUpperBodyPoseReference(pose, 'upper-body-preview');
// Validated by the helper; can also be passed directly to AnatomyViewport.
```

## Rig implementation

Torso rotations are distributed cumulatively across three spine bones, with neck/head rotation
split across their two bones. Arm targets are expressed relative to the rotated torso so they
follow it. One coordinator combines authored clavicle/scapula motion with shrug/reach offsets.
Arm direction rotates the elevation plane. Forearm roll is distributed over the forearm and
its twist bone; wrist offsets remain distal. A reference-plane elbow hinge prevents a zero
cross product and abrupt roll when the elbow straightens. Temporary vectors/quaternions are reused.

Pelvis, lower-body and finger local transforms are never written. Reset and preparation include
all newly controlled bones. The body geometry, bind matrices, attribution and asset license remain
unchanged. Educational highlights use existing represented shoulder/arm regions; new wrist,
forearm, torso and neck channels have no unverified highlight mappings.

## Phone preview

Run `npm run start:go` and open the app in SDK 58-compatible Expo Go. Under the viewer, choose
**Explore upper-body controls**, then a body group and control. Swipe the control list to reach
all arm controls, adjust angles, choose **Arms down**, or **Play pose and return**. Wall-angel
composition controls provide pause/resume during playback. External session sequences take
precedence over this development-only panel.

No native rebuild is needed if the installed client already includes this anatomy branch's
existing Expo GL/Asset/FileSystem dependencies. A camera-only APK still needs those modules.

## Verification and integration boundary

Automated real-asset tests cover every channel's endpoints, sequence interpolation/return,
combined-limit rejection, affected bones, normalized finite rotations, bounded sampled vertices,
fixed lower-body/finger transforms, torso inheritance, distal wrist movement, view invariance,
and straight-elbow continuity. Existing wall-angel and protocol regression tests remain in place.

`npm run check` passes lint, both TypeScript checks and all 31 tests. Android JavaScript export passes. The emulator visual check was blocked
by `DEVICE_IN_USE` in another agent-device session, including a bounded retry; that session was
not reused or closed. New controls have not yet had physical-phone visual or performance testing.

The production `componentCatalog` stays empty. Agent/session wiring, camera visibility/check
metadata and combined-device verification remain team integration work. No new form checks or
physiological measurements are claimed by these rendering controls.
