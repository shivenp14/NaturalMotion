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

The new route reuses the previously compiled native patch; it introduces no native/dependency changes. Run `npm run check` and `npm run export:android`, then smoke-test `naturalmotion://vision-debug`, camera restart, navigation back to the live coach, and live media start/end on Android. Phone-only audio/performance acceptance remains documented separately. Shoulder/armpit refinement remains deferred to optional issue #11, and PR #13's expanded controls are not part of this integration.

PR #15 contains the relevant work from #14. Do not merge the older camera-only configuration over it. If #15 is squash-merged, GitHub may leave #14 open even though its functionality is integrated; coordinate its closure with Derrick rather than merging it again.
