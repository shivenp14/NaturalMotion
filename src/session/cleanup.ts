/** Repeated stop requests must retain the original native shutdown barrier. */
export function appendCleanup(previous: Promise<void>, cleanup?: () => Promise<void>): Promise<void> {
  return cleanup ? previous.catch(() => {}).then(cleanup).catch(() => {}) : previous;
}
