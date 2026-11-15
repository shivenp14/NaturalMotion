# Movement-matched assessment and automatic practice

This branch replaces the live screen's fixed final-goalpost button with planner-selected geometric checks and automatic practice entry. [Automatic avatar views and smooth rotation](AVATAR_VIEWS.md) add presentation choices without changing assessment geometry. Final UI design remains with Roland. Shoulder/armpit deformation remains optional issue #11.

## Runtime boundary

1. The movement planner composes timed movement groups and an `assessment` array. Each selection contains `stepIndex`, `side`, `metric`, and `toleranceDeg` (12–25). Supported metrics are `upper_arm_elevation`, `elbow_bend`, and `forearm_direction`.
2. Code validates the sequence and selections, then derives `AssessmentPlan` targets from the same arm-vector construction used by the rig. The planner cannot supply numeric targets, predicates, correction messages, or new measurement types.
3. The live `play_sequence` action carries `sequence` plus `assessmentPlan`. `SessionProvider.acceptSequence(sequence, assessmentPlan)` validates both before changing session state. A missing/empty plan means unavailable assessment; it does not silently enable the old goalpost check.
4. Metric-space landmarks estimate the selected arm geometry. The evaluator follows the renderer's eased progress through each step. `PlaybackState.phaseElapsedSeconds` preserves position through pause/resume; bounded renderer progress updates correct for frame stalls. Device-local timestamps are calibrated only on the backend wire, as before.
5. The server retains the accepted plan, derives the active targets again, and classifies reported measurements itself. Client-authored status, check ID and feedback wording are not authoritative. This is consistency checking of phone-produced evidence, not independent server-side pose estimation.

The generic `MovementSequence` contract is unchanged. New shared contracts are in `src/shared/assessment.ts`; optional world landmarks and renderer phase progress extend existing contracts. Legacy goalpost diagnostics/tests remain separate from the new live assessment path.

## Practice lifecycle

- Watching is ungraded. The first demonstration must finish before readiness can accumulate.
- The user faces the camera and holds the demonstration's starting arm pose. At least four distinct fresh frames spanning 800 ms must match the supported starting geometry. All six arm metrics are used for readiness because the current renderer starts every composition from bilateral goalpost.
- The app replays the accepted sequence when ready. A display-only replay ID restarts the renderer; assessment/backend context keeps the original canonical ID. The selected checks follow this replay rather than the already-completed demonstration.
- Pause suspends grading and preserves replay progress. Clear, replacement and End reset practice and reject old replay callbacks. A new requested demonstration requires fresh readiness.
- After the replay, the final pose remains observable. There is no automatic repetition, completed assessment, countdown, or instruction to hold longer to finish a check.

`PracticeSession` owns replay identity and readiness. `evaluateAdaptiveForm` returns UI reports and measurement evidence. Final UI should preserve this lifecycle rather than reintroducing the goalpost button.

## Visibility and feedback

Use the front camera in a frontal view with shoulders, elbows, wrists and hips inside the frame. Image visibility must be at least 0.65; usable metric-space points must exist. Side-facing, collapsed or strongly foreshortened geometry is rejected. A fresh upper-arm check does not require the wrist; selecting forearm/elbow checks does. Missing/stale evidence becomes `not_observable` immediately, never aligned.

Visual reports update immediately. Speech requires sustained evidence: corrections 800 ms, alignment 1.2 seconds, visibility loss 2 seconds, with at least three advancing samples. Spoken cues have a four-second global cooldown and unchanged cues are deduplicated. Step/sequence changes reset evidence; they do not bypass the cooldown. Planning suppresses form speech. Gemini receives a short grounded cue and is instructed not to add generic camera-based corrections or technical details.

These are model-estimated geometric similarities to an educational animation. They do not establish overall exercise technique, muscle activation, clinical range of motion, wrist bend, palm orientation, wall contact, pain status or spinal posture. World landmarks are estimated, not calibrated physical measurements. Human accuracy and thresholds still require presentation-phone acceptance.

## Verification and human acceptance

All 155 tests, lint and both typechecks pass, including the subsequent avatar-view coverage. Automated checks cover independent Three quaternion target math, inverted forearms despite matching elbow height/bend, visibility and freshness loss, coordinate convention, forged plans, moving targets, progress/pause synchronization, readiness, replay ownership, feedback timing and the live protocol. Android export passes. Synthetic geometry tests are explicitly separate from phone evidence.

On November 15, the Samsung SM-S928U / Android 17 automated suite passed **5 checks, 0 failed, 2 unsupported**: launch; local controls/cleanup; actual-provider live generation/playback/pause/resume/clear; diagnostic image arrival/restart; final cleanup. Human practice/form quality and native landmark arrival were unsupported while no person was tracked. Local artifacts: `.expo/device-smoke/adaptive-form/`. No simulator was used for this work. A host live-provider request, **“Show me how to do a wall angel.”**, returned two validated movement groups and 12 validated assessment selections, followed by audio output. This does not prove physical microphone or audible-feedback quality.

For the next manual phone test:

1. Keep USB connected and the phone unlocked. Use this branch's Metro on port 8084 and backend on 3002, with physical-phone USB forwarding for both ports. The existing development APK is sufficient; no dependency/native change was added.
2. Tap **Start live coach** and say **“Show me how to do a wall angel.”** Watch with arms relaxed; it should not grade you while watching.
3. After it finishes, move back until shoulders, elbows, wrists and hips are visible, face the phone, and hold the starting goalpost pose. The practice message should change and the avatar should replay without pressing a check button.
4. Follow the replay. At the final pose, keep elbows at shoulder height but point one forearm down, then correct it. Verify direction feedback, not just elbow-height feedback. Also lower an upper arm and try changing elbow bend separately.
5. Hide a wrist or leave the frame. The visual assessment should immediately become not observable; brief occlusion should remain quiet and persistent loss should produce one repositioning cue. Return and confirm recovery.
6. Check pause/resume, request a slower demonstration, and verify fresh readiness for the replacement. End should release camera/microphone. Record unexpected transcripts/errors.

If practice never starts, inspect the development vision diagnostic: `World landmark frames` confirms arrival only, not valid visibility, good metric estimates or correct form. Check framing and lighting before changing thresholds. Do not count the above human acceptance as passed until a person performs it. Issues #4 and #6 therefore remain open; final UI, repeated phone rehearsal and optional deformation work remain separate.
