import type { LiveServerMessage } from '../src/live/protocol';

/** A nonblocking planning acknowledgment is not completion of the requested turn. */
export class LiveCompletion {
  private planning = false;
  private audio = false;
  update(event: LiveServerMessage): boolean {
    if (event.type === 'planning') this.planning = event.active;
    if (event.type === 'audio') this.audio = true;
    return event.type === 'turn_complete' && !this.planning && this.audio;
  }
}
