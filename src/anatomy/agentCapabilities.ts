import { initialUpperBodyPose } from './upperBodyPose';
import { validateUpperBodyComposition } from './upperBodySequence';
import { coachingCatalog } from '../vision/checks/registry';

/** Shared executable capabilities with explicitly conditional vision-check metadata. */
export const anatomyAgentCapabilities = {
  catalog: coachingCatalog,
  compositionPolicy: validateUpperBodyComposition,
  allowPlaybackEdits: false,
  movementGuidance: {
    purpose: 'Educational upper-body animation only; not treatment or a measurement of human range of motion.',
    stepFormat: 'Use timed parallel groups only, including for a single command.',
    initialPose: initialUpperBodyPose(),
    componentChannels: {
      shoulder_elevation: 'elevationDeg', elbow_flexion: 'elbowFlexionDeg',
      shoulder_external_rotation: 'externalRotationDeg',
    },
    durationSeconds: { minimum: 2, maximum: 5 },
    holdSeconds: { minimum: 0, maximum: 2 },
    coordination: 'For each arm, elevationDeg + elbowFlexionDeg must stay between 140 and 190, inclusive. Coordinate shoulder and elbow commands in the same group when needed.',
    continuity: 'Every new sequence starts at initialPose. Each fromDeg must equal that channel at the end of the previous group. Omitted channels retain their values. externalRotationDeg=90 is the authored baseline.',
    playback: 'To change speed or range, return a complete new play_sequence starting from initialPose. Step modification and indexed replay are not connected. Pause and stop are supported.',
    observations: 'Only a stationary bilateral goalpost hold (both arms elevation=90, elbowFlexion=90, externalRotation=90; hold at least 0.6 seconds; include shoulder elevation commands) has a verified elbow-height/spread check. All other phases have no form check. These are authored goalpost-pose semantics, not a conversion of rig angles to measured human angles. Never infer muscle activation or complete correct form.',
  },
} as const;
