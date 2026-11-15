export type PracticeMeasurements = Record<string, number | null>;
export type PracticeSample = { observedAt: number; measurements: PracticeMeasurements };
export type PracticeAttempt = {
  sequenceId: string; attemptId: string; startedAt: number; endedAt: number;
  samples: PracticeSample[];
};
export type PracticeReview = {
  sequenceId: string; attemptId: string;
  status: 'aligned' | 'needs_adjustment' | 'not_observable' | 'incomplete' | 'unavailable';
  message: string; checkId: string | null;
};
