# Android layout smoke test

Tested the anatomy branch at commit `a7ebdfb` on the Android 17 / API 37 emulator through Expo Go. No application source changes were needed.

## Method

Used Android's Developer options → Smallest width setting to exercise logical widths on the existing 1080 × 2400 emulator. The original value was 411 dp. Expo Go was restarted after each change to recreate the GL surface at the new density. Developer options were enabled for access to this setting; font scaling and portrait orientation were not changed.

This changes logical layout area on one emulator. It does not reproduce different hardware, physical screen dimensions, aspect ratios, cutouts, or GPU performance. The 600 dp case is a tablet-like logical layout, not a separate tablet device.

## Observations

| Requested logical width | Checks and observations |
| --- | --- |
| 320 dp | Pose and playback controls wrap into additional rows and remain reachable. Captions and attribution wrap. Composed playback and educational highlights render; the goalpost body can be viewed fully by scrolling. |
| 360 dp | Raised-arm endpoint, hands and feet fit the canvas. View/focus controls fit, and selecting Upper back changes to the back view and selects the region. Extra control rows are scrollable. |
| 411 dp | Original baseline restored and confirmed in Android settings. Fresh app load and controls work; composed playback is rechecked after restoration. Earlier native smoke testing also covered pause/resume, range/speed changes and completion at this width. |
| 600 dp | Pose, view, region and playback controls fit. Raised-arm endpoint, hands and feet fit. A composed sequence reaches “Composition complete · goalpost.” The fixed-height model remains centered with additional horizontal space. |

No blocking horizontal clipping, overlapping control rows, unreachable tested controls, or screen-size-specific animation failure was observed in these checks. The smaller layouts require vertical scrolling; the canvas and all development controls are not expected to fit in one screen simultaneously.

Known shoulder/armpit deformation artifacts remain the existing optional polish item (#11), independent of layout size. The temporary development screen is not Roland's final session design.

## Final state and checks

- Emulator smallest width restored to 411 dp; Expo Go reopened on the project.
- `npm run check` passes lint, both typechecks and all 26 automated tests.
- No dependencies, routes or application source changed during this test.
- Results are recorded in this document; no new screenshots were added to version control.

## Still unverified

Physical presentation-phone performance, other aspect ratios, large accessibility fonts, iOS, and the combined camera/voice/agent experience remain separate checks. This emulator test does not replace the physical-phone smoke test for the first milestone.
