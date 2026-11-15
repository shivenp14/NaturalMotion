import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';
import type { ComponentDefinition, MovementSequence, PlaybackState, SessionPhase } from '../shared/contracts';
import { componentCatalog } from '../shared/catalog';
import { validateSequence, type CompositionPolicy, type SequenceValidation } from '../shared/validateSequence';
import type { AssessmentPlan } from '../shared/assessment';
import { validateAssessmentPlan } from '../vision/assessmentPlan';
import { isAvatarViewPreference, validatePresentationPlan, type AvatarViewPreference, type PresentationPlan } from '../shared/presentation';

type SessionContextValue = {
  catalog: readonly ComponentDefinition[];
  compositionPolicy?: CompositionPolicy;
  phase: SessionPhase;
  sequence: MovementSequence | null;
  paused: boolean;
  playback: PlaybackState | null;
  assessmentPlan: AssessmentPlan | null;
  presentationPlan: PresentationPlan | null;
  avatarView: AvatarViewPreference;
  setAvatarView: (view: AvatarViewPreference) => void;
  setPaused: (paused: boolean) => void;
  recordPlayback: (state: PlaybackState) => void;
  setPhase: (phase: SessionPhase) => void;
  acceptSequence: (input: unknown, assessment?: unknown, presentation?: unknown) => SequenceValidation;
  reset: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, catalog = componentCatalog, compositionPolicy }: PropsWithChildren<{
  catalog?: readonly ComponentDefinition[];
  compositionPolicy?: CompositionPolicy;
}>) {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [sequence, setSequence] = useState<MovementSequence | null>(null);
  const [paused, setPaused] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [assessmentPlan, setAssessmentPlan] = useState<AssessmentPlan | null>(null);
  const [presentationPlan, setPresentationPlan] = useState<PresentationPlan | null>(null);
  const [avatarView, updateAvatarView] = useState<AvatarViewPreference>('auto');
  function setAvatarView(view: AvatarViewPreference) {
    if (!isAvatarViewPreference(view)) throw new Error('Unsupported avatar view.');
    updateAvatarView(view);
  }
  const recordPlayback = useCallback((state: PlaybackState) => {
    // Ignore movement-lab callbacks and late events from replaced sequences.
    if (sequence && state.sequenceId === sequence.id) setPlayback(state);
  }, [sequence]);
  function acceptSequence(input: unknown, assessment?: unknown, presentation?: unknown): SequenceValidation {
    const result = validateSequence(input, catalog, compositionPolicy);
    if (result.ok) {
      let plan: AssessmentPlan | null;
      let views: PresentationPlan | null;
      try { plan = validateAssessmentPlan(assessment, result.sequence); views = validatePresentationPlan(presentation, result.sequence); }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid assessment plan.' }; }
      setSequence(result.sequence);
      setAssessmentPlan(plan);
      setPresentationPlan(views);
      setPaused(false);
      setPlayback(null);
      setPhase('demonstrating');
    }
    return result;
  }
  function reset() {
    setSequence(null);
    setAssessmentPlan(null);
    setPresentationPlan(null);
    updateAvatarView('auto');
    setPaused(false);
    setPlayback(null);
    setPhase('idle');
  }
  return (
    <SessionContext.Provider value={{ catalog, compositionPolicy, phase, sequence, paused, playback, assessmentPlan, presentationPlan, avatarView, setAvatarView, setPaused,
      recordPlayback, setPhase, acceptSequence, reset }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession requires SessionProvider.');
  return context;
}
