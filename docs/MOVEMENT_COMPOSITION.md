# Composable movement contract

The agent will compose supported movement components. A wall angel is our first reference sequence, not the only exercise-shaped command exposed to the agent.

## Contract added

`MovementStep` accepts either the existing single command or a simultaneous group:

```ts
type ParallelMovementStep = {
  parallel: MovementCommand[];
  durationSeconds: number;
  holdSeconds: number;
};
```

Steps run in order. Inside a group, all commands start together, interpolate over the same duration, then hold the resulting pose for `holdSeconds`. Timing belongs to the group so its members cannot silently drift out of sync. Easing, joint coordination, highlighting and interpolation remain renderer-owned.

Legacy single-command sequences remain compatible. Use `getStepCommands(step)` when inspecting components: direct `step.componentId` access no longer covers every step. A group retains one `stepIndex` for playback and feedback. The feedback gate accepts configured check IDs from any member and retains existing freshness and `not_observable` handling.

## Renderer vocabulary — implemented, not registered with the agent yet

- Shoulder elevation, separately addressable on the left/right.
- Shoulder external rotation, separately addressable on the left/right.
- Elbow flexion, separately addressable on the left/right.
- Pose holding, expressed by the group's `holdSeconds` rather than a joint-writing command.

`upperBodyPreviewCatalog` exposes `left_` and `right_` variants of `shoulder_elevation`, `elbow_flexion` and `shoulder_external_rotation`. Every command takes explicit `fromDeg` and `toDeg`. Rendering bounds are elevation 90–150, elbow flexion 20–90 and shoulder rotation 80–100. Elevation plus elbow flexion must stay within 140–190 for each arm. These are authored rendering coordinates, not clinical goniometry: shoulder rotation 90 is the calibrated goalpost reference, with only a small offset currently supported. Scapula/clavicle motion is derived by the rig coordinator, not supplied by the agent.

Commands may omit channels to retain their previous values. A one-sided motion is executable independently; the engine does not dispatch by an exercise ID. Metadata lists only represented educational muscle regions. Camera view remains `unconfigured`, with no landmarks or form checks claimed until Derrick supplies them. The production catalog remains empty.

## Wall angel as a reference sequence

| Stage | Simultaneous commands | Timing |
| --- | --- | --- |
| Setup | Bring both shoulders and elbows into the calibrated goalpost pose | Authored setup transition |
| Rise | Elevate both shoulders while reducing elbow flexion; maintain the configured shoulder rotation | Shared travel duration |
| Hold | Retain the reached pose | Rise group's hold duration |
| Return | Reverse shoulder elevation and elbow flexion back to goalpost | Shared travel duration |

`createWallAngelReference(parameters, id)` now constructs the rise/return groups from six reusable commands. `compileUpperBodySequence` validates them and produces continuous pose segments; `sampleUpperBodyProgram` interpolates all member channels together. The viewport's development Play composition control uses this same pipeline. A renderer-owned one-second preparation blends from the current rig pose into the calibrated goalpost reference before step 0. New programs restart this setup predictably; pause/resume preserves elapsed time within the current program. Removing the sequence returns control to the static preview/rest pose.

Only supported rendering combinations execute. This remains an illustrative rig controller with a small tested envelope, not validated human biomechanics or arbitrary exercise generation. The optional deformation-polish issue still applies.

## Validation and execution boundary

- Validate every member's registered ID and exact numeric parameter set.
- Parallel components must declare `controlledChannels`; reject two commands writing the same channel in the same group.
- Resource bounds: 1–32 steps, 1–12 members per group, 0.25–30 seconds travel and 0–10 seconds hold. These bound protocol resources, not recommended exercise durations.
- Parallel sequences are rejected unless the caller supplies a trusted renderer-owned `CompositionPolicy` to `validateSequence`.
- That policy receives the full structurally validated sequence. It must reject unimplemented combinations, unsupported setup/endpoints, incompatible cross-joint poses and discontinuous transitions between steps. A throwing policy fails closed. An unconditional allow policy is appropriate only for synthetic protocol tests.
- Channel conflicts are only a structural check. Different channels can still form an unsupported pose; a policy is mandatory for that reason.
- The production catalog remains empty. `SessionProvider` still passes no composition policy, so parallel agent execution stays disabled until the renderer and its policy are integrated.

## Viewer interface and playback events

`AnatomyViewport` accepts `sequence`, optional `paused`, and `onPlaybackChange`. It compiles/revalidates input before execution, displays an error for unsupported input, and gives an external sequence precedence over development controls. Each step's educational highlight codes come from its component metadata and side, rather than from agent-supplied activation claims. Manual focus resumes after sequence removal.

Events use the existing shared `PlaybackState` shape: `preparing`, `moving`, `holding`, `returning`, then `completed`; status changes include pause/resume. Events emit only at phase, step or status changes, so `updatedAt` remains a phase-entry/freshness boundary rather than being refreshed on every frame. Decreasing total shoulder elevation classifies a step as `returning`; other transitions are `moving`. Completion holds the final pose. The caller should preserve the sequence object identity during ordinary UI updates and replace it when intentionally restarting/changing the program.

Automated tests cover reference interpolation/holds, one-sided execution, side-specific highlighting, bad starts/unknown IDs/channel conflicts/cross-joint limits, real-rig mapping, preparation continuity and phase timestamps. `npm run check` passes all 26 tests; Android export succeeds. Android 17 Expo Go smoke testing verified composed playback, automatic component highlights, pause/resume, completion at goalpost and the development range/speed controls. Physical-phone performance and the full agent/camera/voice flow remain unverified.

The session integration should validate against the same catalog and policy used by the renderer:

```ts
validateSequence(agentOutput, upperBodyPreviewCatalog, validateUpperBodyComposition);
```

Pass the successful result's `sequence` to the viewport. The viewport validates again, so bypassing the session validator does not bypass the rendering envelope. The existing `SessionProvider` is deliberately unchanged; update its catalog and policy together during integration. On cancellation or rejection, the session owner must reset its active playback/form-evaluation state; the shared playback protocol currently has no cancellation/error status.

## Team handoff

Shiven owns primitive-to-rig mappings, the composition policy and execution events. Derrick supplies actual camera/check metadata and observational limits. Roland integrates the agreed vocabulary/policy into sequence generation, validation and the session flow. No shared type fields were removed, and no final UI, vision or voice files were changed for this protocol foundation.

Before enabling the catalog, agree camera/check metadata together and wire `upperBodyPreviewCatalog` plus `validateUpperBodyComposition` through Roland's sequence-generation/session boundary. Viewer execution and phase events are implemented, but final agent/session wiring is not. Verify the combined experience on the presentation phone. Wall contact and lumbar arching must remain unavailable when the camera cannot establish them.
