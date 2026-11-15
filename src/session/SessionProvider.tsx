import { createContext, useCallback, useContext, useState, type PropsWithChildren } from 'react';
import type { ComponentDefinition, MovementSequence, PlaybackState, SessionPhase } from '../shared/contracts';
import { componentCatalog } from '../shared/catalog';
import { validateSequence, type CompositionPolicy, type SequenceValidation } from '../shared/validateSequence';

type SessionContextValue = {
  catalog: readonly ComponentDefinition[];
  compositionPolicy?: CompositionPolicy;
  phase: SessionPhase;
  sequence: MovementSequence | null;
  paused: boolean;
  playback: PlaybackState | null;
  setPaused: (paused: boolean) => void;
  recordPlayback: (state: PlaybackState) => void;
  setPhase: (phase: SessionPhase) => void;
  acceptSequence: (input: unknown) => SequenceValidation;
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
  const recordPlayback = useCallback((state: PlaybackState) => {
    // Ignore movement-lab callbacks and late events from replaced sequences.
    if (sequence && state.sequenceId === sequence.id) setPlayback(state);
  }, [sequence]);
  function acceptSequence(input: unknown) {
    const result = validateSequence(input, catalog, compositionPolicy);
    if (result.ok) {
      setSequence(result.sequence);
      setPaused(false);
      setPlayback(null);
      setPhase('demonstrating');
    }
    return result;
  }
  function reset() {
    setSequence(null);
    setPaused(false);
    setPlayback(null);
    setPhase('idle');
  }
  return (
    <SessionContext.Provider value={{ catalog, compositionPolicy, phase, sequence, paused, playback, setPaused,
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
