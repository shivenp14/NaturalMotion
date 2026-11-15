import type { AvatarView } from '../shared/presentation';
import { anatomyViewAngles } from './regions';

/** Shortest yaw arc; retargeting always starts at the currently displayed angle. */
export class ViewRotation {
  angle = 0;
  active = false;
  private from = 0;
  private to = 0;
  private elapsed = 0;
  private view: AvatarView = 'front';
  private firstFrame = false;
  setView(view: AvatarView): void {
    if (view === this.view) return;
    this.view = view;
    this.from = this.angle;
    const difference = Math.atan2(Math.sin(anatomyViewAngles[view] - this.angle), Math.cos(anatomyViewAngles[view] - this.angle));
    this.to = this.from + difference;
    this.elapsed = 0;
    this.active = Math.abs(difference) > 0.00001;
    this.firstFrame = true;
  }
  advance(delta: number): number {
    if (!this.active || !Number.isFinite(delta) || delta < 0) return this.angle;
    // Demand rendering can deliver a long first delta after idle. Never turn it into a cut.
    if (this.firstFrame) this.firstFrame = false;
    else this.elapsed += Math.min(delta, 0.05);
    const t = Math.min(1, this.elapsed / 0.85);
    this.angle = this.from + (this.to - this.from) * t * t * (3 - 2 * t);
    if (t === 1) this.active = false;
    return this.angle;
  }
}
