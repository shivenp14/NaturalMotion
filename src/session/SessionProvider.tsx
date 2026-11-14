import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import type { MovementSequence, SessionPhase } from '../shared/contracts';
import { componentCatalog } from '../shared/catalog';
import { validateSequence, type SequenceValidation } from '../shared/validateSequence';

type SessionContextValue = {
  phase: SessionPhase;
  sequence: MovementSequence | null;
  setPhase: (phase: SessionPhase) => void;
  acceptSequence: (input: unknown) => SequenceValidation;
  reset: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [sequence, setSequence] = useState<MovementSequence | null>(null);
  function acceptSequence(input: unknown) {
    const result = validateSequence(input, componentCatalog);
    if (result.ok) {
      setSequence(result.sequence);
      setPhase('demonstrating');
    }
    return result;
  }
  function reset() {
    setSequence(null);
    setPhase('idle');
  }
  return (
    <SessionContext.Provider value={{ phase, sequence, setPhase, acceptSequence, reset }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession requires SessionProvider.');
  return context;
}
