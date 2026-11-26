import { clamp, ease } from './bloom-score';

/** A reversible, finite camera move. Selection is independent of the current
 * lens position so re-grabbing the toggle never snaps to its previous end. */
export class CloseView {
  selected = false;
  amount = 0;
  private from = 0;
  private since = 0;
  private duration = 0;

  get moving() { return this.duration > 0; }

  set(close: boolean, now: number, instant: boolean) {
    const changed = this.selected !== close;
    if (!changed && !instant) return false;
    this.step(now);
    this.selected = close;
    this.from = this.amount;
    this.since = now;
    this.duration = instant ? 0 : 340 * Math.abs(Number(close) - this.from);
    if (!this.duration) this.amount = Number(close);
    return changed;
  }

  step(now: number) {
    if (!this.duration) return;
    const t = clamp((now - this.since) / this.duration);
    this.amount = this.from + (Number(this.selected) - this.from) * ease(t);
    if (t === 1) this.duration = 0;
  }
}
