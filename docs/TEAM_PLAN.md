# Three-Person Build Plan

This is the proposed implementation plan for the product defined in [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md). Assign the three roles according to your strengths. All times are relative to starting implementation and assume the original 12–15-hour budget; recheck how much time remains.

## 1. Ownership at a glance

| Person | Owns | First proof | Finished contribution |
| --- | --- | --- | --- |
| **1: Mobile + vision** | Android development build, camera, pose pipeline, form rules, final integration | Real landmarks from the presentation phone | Movement-specific feedback driven by live camera observations |
| **2: Anatomy + movement** | Asset selection, anatomy rendering, rig control, parameterized animation, muscle highlighting | One moving body with one highlightable region | A polished single model that executes structured movement sequences |
| **3: Agent + voice + experience** | Conversation, hands-free audio, sequence generation and validation, session UI, service endpoint | Spoken request produces a valid structured sequence | A coherent hands-free flow connecting the model and camera feedback |

Give Person 1 to whoever is strongest at native setup and integration, Person 2 to whoever is strongest at graphics or asset tooling, and Person 3 to whoever is strongest at application logic and agent interfaces. Coding agents can help each owner, but each person remains responsible for their track's behavior on the actual phone.

## 2. First 30 minutes: agree on the integration boundary

Do this together before splitting up:

1. Choose the Android presentation phone and record its OS version.
2. Establish the Expo project, shared source location, and a way for everyone to run the same app.
3. Pick a provisional upper-body movement family. Person 2 must be able to animate it, and Person 1 must be able to observe one useful form issue. Confirm the exact movement after the feasibility checks.
4. Define the small shared interfaces below and create sample data for each.
5. Agree on one screen flow: **conversation → demonstration → follow along → feedback → conversation**.
6. Identify native dependencies for camera, graphics, and audio immediately. Person 1 coordinates native build changes so the team avoids repeated incompatible setup changes.

Person 3 owns the shared TypeScript contracts after this discussion. Changes affecting another track must be communicated before merging.

### Minimum shared interfaces

These are proposed contracts, not implemented APIs:

| Contract | Minimum contents | Producer → consumer |
| --- | --- | --- |
| `ComponentDefinition` | Component ID, allowed parameters, muscle-region IDs, required camera view, supported check IDs | Person 2 defines motion capabilities; Person 1 supplies checks → Person 3 uses the catalog |
| `MovementSequence` | Sequence ID and ordered steps containing component ID plus permitted parameters | Person 3 → Person 2 and session controller |
| `PlaybackState` | Sequence ID, active step, movement phase, playing/paused/completed | Person 2 → Person 1 and Person 3 |
| `PoseObservation` | Timestamp, required landmarks, visibility information, coordinate convention | Person 1 → form evaluator |
| `FormEvent` | Sequence/step ID, check ID, status, observation time, supporting measurements | Person 1 → Person 3 |

Use explicit form statuses such as `needs_adjustment`, `aligned`, and `not_observable`. Absence of visible landmarks must not become a successful form result.

Include an evaluation reset when the active component changes. Ignore stale observations or events from an earlier step. Specify whether landmarks are mirrored and how screen coordinates are oriented.

### Samples that unblock parallel work

- Person 2 supplies one sample sequence that can be played directly, without an agent.
- Person 1 supplies sample form events so the feedback UI can be built before pose integration is complete.
- Person 3 supplies a text-entry path for testing sequence generation before hands-free audio works.
- Mark simulated observations clearly in development. Demo acceptance requires real camera observations.

## 3. Person 1: Mobile, pose estimation, and integration

### Responsibilities

1. Get the Expo app running on the actual Android phone. Use a development build when native modules require it.
2. Select and prove a compatible camera-to-pose integration. The camera preview alone is not the milestone.
3. Display landmarks in a temporary debug view and verify orientation, mirroring, visibility, and timestamps.
4. With Person 2, select one movement and one observable form issue that the asset and camera can both support.
5. Implement the relevant geometric check with visibility handling and enough temporal stability to avoid flickering feedback.
6. Synchronize checks with the active movement step and phase. Evaluate only where the check makes sense.
7. Emit structured form events, including recognition of the adjustment.
8. Own integration on the presentation phone: permissions, camera lifecycle, navigation, and combined graphics/audio/camera operation.

### Deliverables

- Running Android build with camera-to-landmark processing.
- Camera positioning instructions for the chosen movement.
- One reliable form check and explicit handling of unobservable input.
- Debug evidence showing why a correction triggered.
- Integrated presentation build.

### Definition of done

On the chosen phone, a deliberately demonstrated form issue triggers the intended observation, an adjustment changes the result, and hiding relevant landmarks produces `not_observable`. The same behavior works while the model and voice features are active.

## 4. Person 2: Anatomical model and movement engine

### Responsibilities

1. Inspect free asset candidates first. If they require too much preparation, evaluate a paid candidate within the team's $25 total asset budget.
2. Check license obligations, actual file structure, rig behavior, independent highlighting, and phone performance. A listing image is insufficient evidence.
3. Load one character in the native renderer and prove one animated pose plus one independently highlighted region.
4. Establish a small movement vocabulary. Start with one component and permitted changes such as speed or repetition; add compatible components only after integration works.
5. Implement structured sequence playback, clear completion events, and predictable transitions between steps.
6. Map components to curated muscle-region highlights.
7. Polish lighting, camera framing, materials, and deformation for the phone display.
8. Document the supported parameters so Person 3 generates only executable instructions.

### Deliverables

- One selected and attributed anatomical asset, or an accepted simpler single-model fallback.
- A native anatomy-view component that accepts a structured sequence.
- A component catalog with supported parameter limits and region mappings.
- Playback state events for the form evaluator and UI.

### Definition of done

The same body animates and highlights regions, visibly responds to at least one permitted parameter change, returns to a predictable state, and runs smoothly enough for the complete phone experience.

### Important limit

Do not let sculpting a detailed body from scratch consume the deadline. If the detailed asset fails, simplify the single model and its muscle-region representation. Keep expected muscle involvement educational; do not present highlighting as measured activation.

## 5. Person 3: Agent, hands-free voice, and session UI

### Responsibilities

1. Own shared contracts and the session state machine, coordinating with both teammates.
2. Choose one agent and audio-service path early. Keep service credentials in a backend or appropriate service-issued session mechanism rather than embedding long-lived provider secrets in the app.
3. Implement structured sequence generation against the actual component catalog.
4. Validate component IDs, supported parameters, and configured limits before playback. Handle invalid output visibly instead of letting it reach the animation engine.
5. Establish the end-to-end flow using text first, then add hands-free alternating listening and speaking.
6. Give the agent structured form observations to explain. Deduplicate corrections so a sustained issue does not cause continuous speech.
7. Ensure the assistant's own spoken response does not become another user request. Test turn completion and listening distance on the phone.
8. Build the main UI around the anatomical model, with camera feedback, short instructions, and understandable session states.
9. Support one conversational modification, such as slower playback or another repetition, that visibly changes execution.
10. Coordinate the final demo script and submission narrative.

### Deliverables

- Structured sequence-generation endpoint or equivalent service integration.
- Runtime sequence validation and useful failure handling.
- Hands-free conversation with clear listening and speaking states.
- Main session UI connecting sequence playback and camera feedback.
- Two-minute demo outline and submission copy.

### Definition of done

A spoken request produces an executable sequence; a supported spoken modification changes it; a real form event leads to a grounded explanation; and listening resumes without a required tap between turns.

## 6. Integration schedule

Treat these as targets. If a milestone slips, reduce scope together immediately.

| Elapsed time | Person 1 | Person 2 | Person 3 | Shared checkpoint |
| --- | --- | --- | --- | --- |
| **0–0.5 h** | Phone/build setup | Asset shortlist | Contracts and session skeleton | Freeze interfaces and assign files |
| **0.5–2 h** | Native camera-to-landmark spike | Load model, move rig, highlight region | Text-to-sequence spike; audio feasibility | Resolve camera, asset, and voice risks |
| **2–4 h** | First form check and real events | Play first parameterized component | Connect sequence generation and basic UI | First integrated loop on Android; label any remaining mocks |
| **4–7 h** | Stabilize check and synchronize phases | Improve movement and highlighting | Hands-free turns and grounded feedback | Complete spoken request → animation → real correction flow |
| **7–10 h** | Combined-device reliability | Visual polish and performance | Conversation/UI polish; modification request | Three consecutive successful full-flow runs |
| **10–12 h** | Fix only demo blockers | Final visual fixes and attribution | Rehearsal, submission material | Freeze scope, rehearse, submit before actual deadline |
| **12–15 h, if available** | Buffer for failures | Buffer for failures | Buffer for failures | Optional expansion only after acceptance and submission readiness |

**Do not wait until the end to combine camera, graphics, microphone, and spoken playback.** Individually working modules are not proof that the phone can run the complete experience reliably.

## 7. Decision checkpoints and scope cuts

### Camera checkpoint: 60–90 minutes into integration

Person 1 must show actual pose landmarks from the phone or explain the specific blocker. Choose one recovery route rather than repeatedly switching libraries. If continuous processing is infeasible, the team must explicitly decide whether timed pose checkpoints are an acceptable scope change; describe that behavior accurately.

### Asset checkpoint: approximately hour 2

Person 2 must show one animated component and one highlightable region on the phone. If the detailed asset cannot support both, use the simpler unified-body fallback. Keep a record of license and attribution requirements.

### Conversation checkpoint: approximately hour 2

Person 3 must show a valid structured sequence from text and a tested path for phone audio. Text input is a development aid while hands-free interaction is completed.

### Integration checkpoint: approximately hour 4

Show one sequence passing through the actual application boundary into the renderer, plus a form event reaching the feedback UI. Identify every remaining mock and assign its removal to an owner.

### Cut first if behind

1. iOS work.
2. Additional body regions.
3. Additional movement components and form checks.
4. Extra screens, persistence, or onboarding beyond what the demo requires.
5. Voice interruption and other conversational refinements.

Preserve the central demonstration: one model, a visible parameter change, hands-free interaction, and one real camera-grounded correction.

## 8. Collaboration rules

- Person 1 coordinates native dependencies, app configuration, and lockfile changes. Person 2 and Person 3 flag their dependencies during the initial setup.
- Suggested ownership: Person 1 owns `vision/` and native integration; Person 2 owns `anatomy/` and model assets; Person 3 owns `agent/`, `voice/`, session UI, and shared contracts. Adapt paths to the actual project structure.
- Integrate small changes at least at each checkpoint. Test merged code on the same phone.
- When using multiple coding agents, give them bounded files and concrete acceptance criteria. Each human reviews the resulting integration.
- Use sample inputs to develop independently, then remove mocks from the acceptance path.
- Freeze a known-working build before late changes. Have a launch/reset procedure ready for the demo.

## 9. Final shared acceptance checklist

- [ ] Android presentation build launches reliably.
- [ ] User speaks from the actual movement position without needing to tap between turns.
- [ ] Agent returns a validated sequence using implemented components.
- [ ] The single anatomical model performs it and highlights the intended regions.
- [ ] A supported spoken modification visibly changes playback.
- [ ] Real camera observations detect one intentionally demonstrated form issue.
- [ ] The app explains the issue and recognizes the user's adjustment.
- [ ] Poor visibility produces a repositioning request or an unavailable assessment.
- [ ] Camera, model, microphone, and audio playback work together.
- [ ] Unsupported or invalid movement instructions cannot reach the renderer unchecked.
- [ ] Three consecutive complete runs pass on the presentation phone.
- [ ] The presentation fits the available demo time and describes implemented coverage accurately.
- [ ] Asset attribution and submission materials are ready before the operative deadline.

The team is ready to expand only after this flow works. The strongest hackathon story is a complete interaction that judges can see and verify.
