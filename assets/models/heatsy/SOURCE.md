# Heatsy body asset

- Creator/adaptation: DDDEV LTD, 2026.
- Upstream: https://github.com/heatsy-app/heatsy-body-model
- Pinned commit: `6cf6a0ae7c63bcffca1137ddcec14a31b7254a6d`.
- Original model path: `model/body_superficial.app5m.glb`.
- Local file: `body.glb`, 4,357,304 bytes.
- SHA-256: `ce9859de013c2ee9713dbe3158275208b57be1b4ff31957eca87195b991c0ab1`.
- License: CC BY-SA 4.0; full text in `LICENSE`, attribution in `NOTICE.md`.

The original `body.glb` and muscle vocabulary are redistributed byte-for-byte. `upstream-manifest.json` preserves upstream file hashes; it also lists an object map not downloaded here. No proprietary Heatsy application code, animations, equipment, or commercial head assets are included.

NaturalMotion changes presentation at runtime: a neutral graphite material, cosmetic fiber shading using the supplied direction data, new lighting, and selectable region focus. The app loads `body-smoothed.glb`, a CC BY-SA 4.0 adaptation that smooths the original skin weights over 64 passes of connected-face neighbors, adds continuous torso-origin anchors for trapezius/lats/pectoralis major, and renormalizes four influences per vertex. This reduces tearing during shoulder movement. Geometry, muscle IDs, bones, bind matrices and coordinates are unchanged. Regenerate with `node --import tsx scripts/prepare-anatomy-weights.mjs`; adaptation runs offline, not on the phone. Adapted SHA-256: `0ca8f60bac1e1be9b79d4469384ad2d0bf36f5ba93712b41c3e35c708744b7b1`. The adaptation is a rendering correction, not a biomechanical simulation. Retain the source notices and CC BY-SA obligations when distributing model adaptations. These asset notices do not replace the application's source-code license.

Credit: Adapted by DDDEV LTD from Z-Anatomy by Gauthier Kervyn and Marcin Zielinski, derived from BodyParts3D, © The Database Center for Life Science. See `NOTICE.md` for the full upstream attribution and history. No endorsement is implied.

## Geometry coverage

Inspection of the actual `_PART_ID` vertex attribute found 54 represented parts, corresponding to 43 named muscle entries. The vocabulary contains 119 parts, including deeper structures that are **not** in this mesh. Presence in `muscles.json` is not proof of renderable geometry.

The current viewer offers only verified shoulder and upper-back region focus. Rhomboids, levator scapulae, several deeper shoulder structures, and deep spinal muscles are absent. Do not claim complete anatomical coverage or measured muscle activation.

## Quantized positions

This file uses `KHR_mesh_quantization`, and its inverse-bind matrices already decode the integer positions into human-scale coordinates during skinning. Do not multiply the actual position attribute by `0.0001` again. Only the cosmetic shader's rest-space fiber calculation uses that unit conversion.
