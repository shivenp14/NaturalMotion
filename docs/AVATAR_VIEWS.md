# Automatic avatar views and smooth rotation

The movement planner selects a view for each timed group using the requested movement, the component's curated muscle-region highlights and explicit user preferences. Supported views are front, back, right side (`side`, preserving the existing ID), and left side (`left_side`). The planner is instructed to keep a stable view unless a change adds useful information.

The backend expands each group's `view` into a separate `PresentationPlan`, tied to the movement ID. The app validates every step index and view before accepting the sequence. Arbitrary camera transforms are rejected. Movement execution and assessment retain their existing meaning; presentation does not measure muscle activation or alter the person's required camera orientation.

In Auto mode, the live screen follows the plan's active step during both demonstration and practice replay. Older/authored sequences without a presentation plan use a deterministic fallback based on actual highlighted parts: posterior regions favor back, unilateral lateral shoulder regions favor their visible side, and bilateral arm visibility favors front. Neutral anatomy begins front-facing.

## Explicit user control

Gemini exposes `set_avatar_view({view})` for requests such as **“Show me the back of the model.”** This is a view-only action; it does not call the movement planner, replace the sequence or restart playback. It waits for complete user input, validates arguments, deduplicates call IDs and permits one view change per user turn. The app acknowledges acceptance before the model confirms the change.

Voice requests update the session's `avatarView` preference. Explicit choices override the plan across steps and replacement demonstrations. **“Choose the best view automatically again”** restores automatic selection; Clear/End resets it. A viewpoint change never asks the person to turn away from the front camera. Manual view and region-focus buttons have been removed. Highlights follow active movement components, and the current view remains a read-only caption.

## Rotation and UI handoff

`ViewRotation` animates the shortest yaw arc over approximately 850 ms with eased endpoints. Retargeting begins at the currently rendered angle. Long first-frame deltas do not jump to the endpoint. The render loop requests frames until rotation settles, even while movement is paused, finished or absent. Rotation updates the group directly rather than using React state every frame. Skin geometry and existing deformation are unchanged.

For Roland's final UI, preserve `AnatomyViewport`'s `automaticView` and `viewPreference` props. `SessionProvider` owns `presentationPlan` and `avatarView`; `plannedAvatarView` resolves the canonical source step even when the renderer plays a separate practice replay ID. View changes use the same smooth path for voice and automatic choices.

## Verification

Regression coverage includes view-plan validation, shortest-arc continuity, retargeting, long idle deltas, opposite-side selection, region fallback, request ownership/cancellation, and view-only actions leaving movement intact. The updated physical-phone suite checks absence of manual view/focus controls and an actual-provider **“Show me the back of the model”** request settling while movement stays paused. Renderer markers include both preference and target view so an already matching automatic angle cannot masquerade as an applied explicit request.

Real provider checks returned `back, back` for **“Show me how to do a wall angel, focusing on the back muscles.”**, and a single `set_avatar_view(back)` action with no movement for the view-only request. Native microphone recognition, aesthetic acceptance of transitions and real-person assessment remain manual phone checks. Optional shoulder/armpit issue #11 is unaffected.

Before button removal, **155 tests**, lint, both typechecks and Android export passed. Samsung SM-S928U / Android 17: **6 smoke checks passed, 0 failed, 2 unsupported**, including both side controls, idle/paused rotation and a live back-view request. No simulator was used. Human practice/form quality and landmark arrival from the no-person feed remained unsupported. Those local logs are in `.expo/device-smoke/avatar-views-final/`.

After button removal, the phone suite again passed **6 checks, 0 failed, 2 unsupported**. The current suite checks the absence of manual controls and a voice-tool back-view request while paused. Local logs: `.expo/device-smoke/avatar-controls-removed-confirmed/`. Test navigation was adjusted for the shorter layout after its old upward scroll missed Pause. The subsequent completion-invitation change is documented in [ADAPTIVE_FORM_COACHING.md](ADAPTIVE_FORM_COACHING.md).
