# Derrick vision PR integration

PR #14 (`aa626e16f025a93b58dcd569d5c84b47b9885b97`) is integrated into the agent/voice branch for PR #15. No merge into `main` was performed; Shiven will merge the combined PR manually.

The orientation converter, visibility/direction-aware goalpost evaluator, freshness helpers, stabilization, vision tests, native package version and Full-model selection were already imported and matched Derrick's latest PR head. The merge adds his standalone `/vision-debug` diagnostic and preserves his branch history.

Conflict resolutions preserve the combined application:

- Keep the existing Expo audio, speech, asset and pose plugins and npm lockfile.
- Keep the pinned native patch with both upright inference and opt-in sampled images for Gemini.
- Keep the adapter's sampled-image callback, fatal/nonfatal error distinction and accurate live-camera transmission wording.
- Do not adopt Derrick's personal Expo owner/project ID. The project's existing build-account configuration remains unchanged.
- Keep the local personal-standards ignore rule.
- Keep `/` as the session entry route. The diagnostic has no product navigation link and returns no screen in release builds.

The live coach stops media on route blur. The diagnostic camera is active only while that route is focused, so navigating between the two cannot leave two active camera consumers.

## Merge preparation verification

- `npm run check`: lint, both TypeScript checks and all 111 tests pass.
- `npm run export:android`: passes with the diagnostic route included.
- The installed native pose patch passes its version/hash verification unchanged.
- Android 17 emulator: diagnostic feed opens, Restart camera works, live local media counters advance, navigating to diagnostics releases live media, and system Back returns to the stopped live screen. The virtual feed contains no person, so it cannot validate human pose accuracy.
- Real-provider smoke tests pass for a compiler-valid two-group movement and an explanation-only request with no movement. Test completion now waits until pending planning has finished.

Outstanding PR review findings were checked against the current code. Fixes cover waiting-tool cancellation, final transcript qualifiers, flushing startup playback context, minimum demonstration holds, HTTP body deadlines, supported HTTP payload fields, terminal action ordering, legacy voice shutdown/restart and preflight control capabilities. Model overrides may omit the reasoning parameter; the default GPT-6 Luna setting remains low. Budget exhaustion is identified explicitly and reasoning-enabled legacy responses have a larger output allowance. Historical latency evidence remains a small typed-input sample; physical-phone acceptance is still separate.

Neither PR #14 nor PR #15 was merged into main by this work. The current branch includes #14's head as an ancestor and is based on the latest fetched main. Shiven should review PR #15's current checks and merge it manually when ready.

The new route reuses the previously compiled native patch; it introduces no native/dependency changes. Run `npm run check` and `npm run export:android`, then smoke-test `naturalmotion://vision-debug`, camera restart, navigation back to the live coach, and live media start/end on Android. Phone-only audio/performance acceptance remains documented separately. Shoulder/armpit refinement remains deferred to optional issue #11, and PR #13's expanded controls are not part of this integration.

PR #15 contains the relevant work from #14. Do not merge the older camera-only configuration over it. If #15 is squash-merged, GitHub may leave #14 open even though its functionality is integrated; coordinate its closure with Derrick rather than merging it again.
