> SUPERSEDED: Shiven’s canonical `id`/`stepIndex` and simultaneous command format is authoritative.
> This historical draft is incompatible and must not be used by active consumers.

> Archived input draft for reference only. These modules are not imported by the app.
> `enabled: true` in the candidate catalog does not register or verify a live capability.
> Use the implementations under `src/` and the migration notes in `docs/WORKER3_CONTRACTS.md`.

# Worker 3 draft — movement catalog and agent returns

A minimal TypeScript scaffold based on the project's `PRODUCT_BRIEF.md` and `TEAM_PLAN.md`. All movement/check IDs and cues are **proposed** until Workers 1 and 2 confirm the camera check and animation exist on the presentation Android device.

- `contracts.ts` — shared typed boundaries: movement definitions, sequences, playback state, vision form events, and agent actions.
- `catalog.ts` — one candidate `overhead_reach` movement, approved demo cue text, and sequence validation.
- `decide.ts` — deterministic event-to-action policy with stabilization, stale-event protection, visibility handling, and simple feedback suppression.
- `examples.ts` — sample response to user speech, form correction, successful adjustment, and spoken modification.

Test with: `tsc --strict --target ES2020 --module commonjs --outDir build *.ts && node build/examples.js`.

## Integration responsibilities

- **Worker 1** provides real `FormEvent`s and establishes the actual thresholds and `stable` flag. The geometry and view must be calibrated and tested.
- **Worker 2** implements every `animationId` in the `ComponentDefinition`, the permitted parameters, actual Heatsy muscle group mapping and playback state.
- **Worker 3** validates proposed sequences/actions, directs them to the anatomy engine, resolves spoken cue IDs to text, and manages microphone/TTS and session state.

## Important constraints

- `overhead_reach` is only a candidate. Its exact form checks, visual muscle mappings, and parameters are unverified.
- The anatomy highlights illustrate expected associations; they do **not** measure actual individual muscle activation.
- Do not expose personal camera footage to a remote model without explicit informed consent. The preferred form pipeline processes pose locally.
- Do not diagnose or claim to treat back pain or injury. Stop if the user reports worsening pain and advise appropriate professional assessment for concerning symptoms.
- For production, validate unknown LLM JSON at runtime (e.g., with Zod or JSON Schema) before casting it to `MovementSequence` or `AgentReturn`. This scaffold's `validateSequence` is an illustrative domain-level check and does not replace strict untrusted-input validation.
- Add feedback cancellation/reset on step changes and TTS interruption handling during integration.
