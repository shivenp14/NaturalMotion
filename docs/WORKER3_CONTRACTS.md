# Agent integration with Shiven's movement contract

Shiven's anatomy sequence is the source of truth. `src/shared/contracts.ts`, `movementSteps.ts`, `validateSequence.ts`, and `formEvents.ts` are copied unchanged from `feat/anatomy-viewer` at commit `43926e4cd925ee4272a06b67efd67d8ffc9d22ef`. Derrick's vision branch uses the same `id`/`stepIndex`/timestamp conventions for single-command sequences. Shiven's simultaneous groups extend that format without changing vision's event shape.

The original Worker 3 draft is archived under `docs/drafts/worker3/`. Its `sequenceId`/`stepId` sequence format, fixed string `speed`/`side` parameters, draft component metadata, and event fields are superseded. These archived modules are never imported by the app, server, or active tests. They must not be used as integration examples.

## Canonical wire format

```ts
// Steps execute in order. All members of a group execute together.
type MovementCommand = {
  componentId: string;
  parameters: Record<string, number>;
};
type MovementStep = MovementCommand | {
  parallel: MovementCommand[];
  durationSeconds: number;
  holdSeconds: number;
};
type MovementSequence = { id: string; steps: MovementStep[] };
```

Parameter names, numeric limits, integer constraints, labels, muscle regions and controlled channels come from the renderer's `ComponentDefinition`. Do not invent generic speed/side fields or flatten simultaneous commands into sequential steps. A request to slow a group changes its timing; it does not add a `speed` parameter. The model schema derives commands from the configured catalog.

Playback retains `sequenceId`, `stepIndex`, `phase`, `status`, and `updatedAt`. Phases are `preparing`, `moving`, `holding`, `returning`, and `completed`. `updatedAt` is a phase/status/step entry timestamp, not a heartbeat. One simultaneous group occupies one step index.

Vision emits `FormEvent` with `sequenceId`, `stepIndex`, `checkId`, `status`, `observedAt`, and numeric `measurements`. Vision owns landmark validation, temporal stabilization, and conversion of poor visibility into `not_observable`. No new `eventId`, `stable`, `visibilityOk`, or timestamp fields are required from Derrick. All timestamps use Unix milliseconds.

## Agent-only boundaries

`AgentAction`, `AgentReturn`, cue-routing definitions and feedback state live in `src/agent/types.ts`; they do not change the shared renderer/vision contracts. The provider's unknown output must pass `validateAgentReturn` before any actions execute.

- `play_sequence` carries the canonical sequence unchanged.
- `modify_playback` carries `stepIndex` and a complete replacement `step`. The full modified sequence is revalidated, including continuity and cross-joint constraints. For an incompatible transition spanning several steps, generate a complete replacement sequence instead.
- `replay_demonstration` targets a zero-based `stepIndex`. The eventual renderer controller must handle restoring a supported starting pose; indices alone do not prove arbitrary step replay is executable.
- Speech, pause, stop and no-action variants retain their existing meaning. Form-event actions may use reviewed cues only.

Legacy Worker 3 payloads are rejected explicitly by shape validation, rather than silently translated. There is no universal safe conversion from speed/side/repetitions to authored simultaneous joint motion.

## Trusted composition policy

Structural validation checks 1–32 steps, exact numeric parameter sets and limits, 1–12 commands per group, declared nonconflicting controlled channels, and group resource timing limits. Parallel sequences fail closed without a renderer-owned `CompositionPolicy`. That policy must validate the whole sequence's joint coordination, supported timing, initial pose and continuous transitions. A throwing policy also rejects execution.

The same catalog and policy must be configured at every boundary:

- `SessionProvider` accepts trusted `catalog` and `compositionPolicy` props and exposes them to the session consumer.
- The voice panel passes that configuration to `HttpAgentAdapter` and `TurnCoordinator`.
- `createAgentServer` accepts server-owned `catalog`, `compositionPolicy`, and reviewed `cues` options. It never trusts client-supplied capability definitions or executable policy.
- `AnatomyViewport` must independently revalidate at execution, as Shiven's branch already does.

PR #12 is now merged into main and integrated here. `anatomyAgentCapabilities` configures Shiven's `upperBodyPreviewCatalog` and `validateUpperBodyComposition` together in the app root and server entrypoint. Do not substitute an unconditional-allow policy. The generic shared default catalog remains empty; the six explicit runtime components have no camera checks. The session passes accepted sequences to the renderer and stores phase/status reports. Indexed modification/replay are intentionally not advertised by this configured service; complete replacement sequences support movement changes.

## Feedback routing

`getStepCommands` inspects either shape. The shared feedback gate accepts supported checks from any active group member and rejects mismatched/stale/future events. The agent's separate `CheckFeedbackDefinition` binds component/check IDs to approved cue IDs and agreed playback phases; its default registry is empty. The configured component must advertise the check, and its command must belong to the active step.

`decideFromFormEvent` adds observation-order protection and a 2-second age limit, preserves `not_observable`, deduplicates sustained statuses and applies a 2.5-second cue cooldown. Suppressed acknowledgment remains eligible on a later fresh observation. Context changes reset feedback. The session controller must also cancel queued speech on changes/pause/stop; cue selection alone cannot cancel device audio.

## Verification

Tests copied unchanged from Shiven's shared-contract and composition suites verify backward compatibility and group validation. Additional agent tests cover complete group replacement, indexed actions, legacy rejection, renderer-policy enforcement, canonical vision feedback, and provider schemas. HTTP integration tests use a mocked provider to verify canonical sequences survive the backend and client unchanged. These are protocol checks, not evidence of renderer or full camera/voice execution.
