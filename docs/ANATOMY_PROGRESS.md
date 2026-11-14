# Anatomy proof: current state

Shiven's first milestone is in progress. The approved baseline is the free Heatsy body model, with a cleaner finish inspired by the provided gray anatomical reference.

## Implemented

- One actual rigged body, bundled locally rather than loaded from a third-party service.
- Neutral graphite material, soft directional lighting, and subtle procedural fiber grain informed by the asset's fiber-direction attribute.
- Preserved mannequin head, original silhouette, skinning, and mesh data.
- Front, back, and side views; all-gray, shoulder, and upper-back region focus.
- Material detail remains visible when a represented region is highlighted.
- Loading/error states, visible attribution, and demand-driven rendering to avoid continuous idle animation.
- Separate native and web Canvas entry points and Metro GLB asset support.

The finish is an illustrative treatment. It does not add missing muscle geometry or estimate muscle activation. Asset provenance and coverage are in `assets/models/heatsy/SOURCE.md`.

Desktop material previews rendered from the same material/model code as the app:

- [Front](previews/anatomy-front.png)
- [Back](previews/anatomy-back.png)
- [Shoulder focus](previews/anatomy-front-highlight.png)
- [Upper-back focus](previews/anatomy-back-highlight.png)

## Integration boundaries

The agent-facing catalog remains empty. The viewport accepts the existing sequence prop for interface compatibility but does not yet execute sequences or emit playback events. Camera and voice integrations are unchanged.

Rendering dependencies were added to `package.json` and `package-lock.json`: React Three Fiber, Three.js, Expo GL, Expo Asset, Expo FileSystem, and Three.js types. Native integration owner Derrick should include these in the next development build. A matching Expo Go build may support the bundled Expo modules, but the team's custom development client must be rebuilt after these additions.

## Still required for the milestone

- Test performance on the physical Android 17 presentation phone. Native rendering, view controls, region highlighting, and reload have now passed on the local Android 17 emulator through Expo Go; see [Android test results](ANDROID17_TEST_RESULTS.md). This does not establish physical-phone performance or custom development-build compatibility.
- Choose the first movement family with Derrick, using only represented muscle regions for the demonstration's highlights.
- Prove that movement deforms acceptably on this rig before registering its components.

No movement has been clinically validated, prescribed, or registered by this visual-finish work.

## Verification of this visual pass

- Lint and app/test TypeScript checks pass.
- All 11 automated tests pass, including real-asset skinning scale, correct region masking, independent viewport resources, and the Android startup resolution regression checks.
- Android JavaScript export includes the local GLB and succeeds.
- Expo Doctor passes all 20 checks.
- Four desktop WebGL renders using the shared app material compile successfully: neutral front/back and shoulder/upper-back focus. Preview images above are desktop material evidence, not Android screenshots.
