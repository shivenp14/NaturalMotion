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

## First proposed vocabulary — not registered yet

- Shoulder elevation, separately addressable on the left/right.
- Shoulder external rotation, separately addressable on the left/right.
- Elbow flexion, separately addressable on the left/right.
- Pose holding, expressed by the group's `holdSeconds` rather than a joint-writing command.

The first implementation may use side-specific component IDs because current parameter contracts accept numbers only. Final IDs, angle meanings, parameter limits and anatomical channels must match the calibrated rig implementation before registration. We have not invented executable capabilities or vision checks in the production catalog.

## Wall angel as a reference sequence

| Stage | Simultaneous commands | Timing |
| --- | --- | --- |
| Setup | Bring both shoulders and elbows into the calibrated goalpost pose | Authored setup transition |
| Rise | Elevate both shoulders while reducing elbow flexion; maintain the configured shoulder rotation | Shared travel duration |
| Hold | Retain the reached pose | Rise group's hold duration |
| Return | Reverse shoulder elevation and elbow flexion back to goalpost | Shared travel duration |

The current wall-angel preview already coordinates these joints through its authored rig controller. It does **not** yet compile or execute this generalized protocol. Mapping each independently parameterized primitive to that rig, coordinating scapula/clavicle motion, and calibrating valid combinations are the next implementation work. Do not equate independent joint angles with validated human biomechanics.

## Validation and execution boundary

- Validate every member's registered ID and exact numeric parameter set.
- Parallel components must declare `controlledChannels`; reject two commands writing the same channel in the same group.
- Resource bounds: 1–32 steps, 1–12 members per group, 0.25–30 seconds travel and 0–10 seconds hold. These bound protocol resources, not recommended exercise durations.
- Parallel sequences are rejected unless the caller supplies a trusted renderer-owned `CompositionPolicy` to `validateSequence`.
- That policy receives the full structurally validated sequence. It must reject unimplemented combinations, unsupported setup/endpoints, incompatible cross-joint poses and discontinuous transitions between steps. A throwing policy fails closed. An unconditional allow policy is appropriate only for synthetic protocol tests.
- Channel conflicts are only a structural check. Different channels can still form an unsupported pose; a policy is mandatory for that reason.
- The production catalog remains empty. `SessionProvider` still passes no composition policy, so parallel agent execution stays disabled until the renderer and its policy are integrated.

## Team handoff

Shiven owns primitive-to-rig mappings, the composition policy and execution events. Derrick supplies actual camera/check metadata and observational limits. Roland integrates the agreed vocabulary/policy into sequence generation, validation and the session flow. No shared type fields were removed, and no final UI, vision or voice files were changed for this protocol foundation.

Before enabling the catalog, agree the exact component metadata together, wire the trusted policy through the session boundary, implement playback and phase events, and test a valid wall-angel composition plus rejected conflicting/unsupported compositions on Android. Wall contact and lumbar arching must remain unavailable when the camera cannot establish them.
