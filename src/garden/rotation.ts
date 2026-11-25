const FRONT_YAW = -0.10;
const FRONT_PITCH = 0;
const TURN = 2 * Math.PI;
const RESPONSE = 0.4; // seconds
const FREQUENCY = TURN / RESPONSE;
const VELOCITY_WINDOW_MS = 80;
const DECELERATION_RATE = 0.99;
const ANGLE_EPSILON = 0.0001; // radians
const VELOCITY_EPSILON = 0.001; // radians/second
// Limit a flick to ~69° of projected travel, even for noisy/tiny sample intervals.
// Cap the combined speed, so diagonal flicks retain their direction.
const MAX_RELEASE_SPEED = 12; // radians/second

type Axis = { value: number; target: number; velocity: number };
type Sample = { yaw: number; pitch: number; timeMs: number };
type Grab = { x: number; y: number; yaw: number; pitch: number; samples: Sample[] };
type Spring = { kind: 'momentum' | 'reset'; timeMs: number | null };

function frontNear(angle: number, front: number): number {
  return front + TURN * Math.round((angle - front) / TURN);
}

function projection(velocity: number): number {
  return (velocity / 1000) * DECELERATION_RATE / (1 - DECELERATION_RATE);
}

function releaseVelocity(samples: Sample[], timeMs: number) {
  const first = samples[0];
  if (!first || first.timeMs >= timeMs) return { yaw: 0, pitch: 0 };

  const start = Math.max(first.timeMs, timeMs - VELOCITY_WINDOW_MS);
  const duration = timeMs - start;
  let yaw = 0;
  let pitch = 0;
  let previous = first;
  for (const sample of samples) {
    const from = Math.max(start, previous.timeMs);
    if (sample.timeMs > from) {
      // Interpolate a segment across the window edge and weight recent motion
      // more heavily. Any gap from the last sample to release counts as still.
      const fraction = (sample.timeMs - from) / (sample.timeMs - previous.timeMs);
      const weight = ((from - start) + (sample.timeMs - start)) / (2 * duration);
      yaw += (sample.yaw - previous.yaw) * fraction * weight;
      pitch += (sample.pitch - previous.pitch) * fraction * weight;
    }
    previous = sample;
  }
  // Convert from radians/ms to radians/s; mean weight over the window is 1/2.
  const scale = Math.min(2000 / duration, MAX_RELEASE_SPEED / Math.hypot(yaw, pitch));
  return { yaw: yaw * scale, pitch: pitch * scale };
}

/** Presentation angles in radians. Event/frame timestamps share one monotonic millisecond clock. */
export class BouquetRotation {
  #yaw: Axis = { value: FRONT_YAW, target: FRONT_YAW, velocity: 0 };
  #pitch: Axis = { value: FRONT_PITCH, target: FRONT_PITCH, velocity: 0 };
  #grab: Grab | null = null;
  #spring: Spring | null = null;
  #reducedMotion = false;

  get yaw(): number { return this.#yaw.value; }
  get pitch(): number { return this.#pitch.value; }
  /** Whether to schedule another frame; held drags update only on move. */
  get moving(): boolean { return this.#spring !== null; }

  constructor() {}

  grab(x: number, y: number, timeMs: number): void {
    this.stop();
    const { yaw, pitch } = this;
    this.#grab = { x, y, yaw, pitch, samples: [{ yaw, pitch, timeMs }] };
  }

  move(x: number, y: number, timeMs: number, sensitivity: number): void {
    const grab = this.#grab;
    if (!grab) return;
    const yaw = grab.yaw + (x - grab.x) * sensitivity;
    const pitch = grab.pitch + (y - grab.y) * sensitivity;
    this.#yaw.value = yaw;
    this.#pitch.value = pitch;

    const { samples } = grab;
    const previous = samples[samples.length - 1];
    if (previous && timeMs <= previous.timeMs) {
      timeMs = previous.timeMs;
      samples.pop();
    }
    samples.push({ yaw, pitch, timeMs });
    // Retain one sample just outside the window to interpolate its boundary.
    while (samples[1] && samples[1].timeMs <= timeMs - VELOCITY_WINDOW_MS) samples.shift();
  }

  release(timeMs: number, cancelled = false): void {
    const grab = this.#grab;
    this.#grab = null;
    if (!grab || cancelled || this.#reducedMotion) return;

    const last = grab.samples[grab.samples.length - 1];
    timeMs = Math.max(timeMs, last?.timeMs ?? timeMs);
    const { yaw, pitch } = releaseVelocity(grab.samples, timeMs);
    this.#yaw.velocity = yaw;
    this.#pitch.velocity = pitch;
    this.#startSpring(this.yaw + projection(yaw), this.pitch + projection(pitch), 'momentum', timeMs);
  }

  step(timeMs: number): boolean {
    const spring = this.#spring;
    if (!spring) return false;
    if (spring.timeMs === null) {
      // Reset has no event timestamp; anchor it to its first requested frame.
      spring.timeMs = timeMs;
      return true;
    }
    if (timeMs <= spring.timeMs) return true;
    // Closed-form damped harmonic oscillator, not frame-sized Euler steps.
    // Two seconds is past rest for both springs and bounds math after a pause.
    const dt = Math.min((timeMs - spring.timeMs) / 1000, 2);
    spring.timeMs = timeMs;
    const damping = spring.kind === 'reset' ? 1 : 0.8;
    const decay = damping * FREQUENCY;
    const envelope = Math.exp(-decay * dt);
    const oscillation = FREQUENCY * Math.sqrt(1 - damping * damping);
    const cosine = Math.cos(oscillation * dt);
    const sine = oscillation === 0 ? dt : Math.sin(oscillation * dt) / oscillation;
    for (const axis of [this.#yaw, this.#pitch]) {
      const displacement = axis.value - axis.target;
      const { velocity } = axis;
      axis.value = axis.target + envelope * (displacement * cosine + (velocity + decay * displacement) * sine);
      axis.velocity = envelope * (velocity * cosine - (FREQUENCY ** 2 * displacement + decay * velocity) * sine);
    }
    this.#settleIfAtRest();
    return this.moving;
  }

  reset(instant = false): void {
    this.#grab = null;
    if (instant || this.#reducedMotion) {
      this.stop();
      this.#yaw.value = FRONT_YAW;
      this.#pitch.value = FRONT_PITCH;
      return;
    }
    // Keep the live spring velocities and use the nearest equivalent front
    // angles. Do not wrap the presentation angles at the end of the reset.
    this.#startSpring(frontNear(this.yaw, FRONT_YAW), frontNear(this.pitch, FRONT_PITCH), 'reset', null);
  }

  nudge(yawDelta: number, pitchDelta: number): void {
    this.stop();
    this.#yaw.value += yawDelta;
    this.#pitch.value += pitchDelta;
  }

  setReducedMotion(reduced: boolean): void {
    this.#reducedMotion = reduced;
    if (!reduced) return;
    if (this.#spring?.kind === 'reset') this.reset(true);
    else if (this.#spring) this.stop();
  }

  stop(): void {
    this.#grab = null;
    this.#spring = null;
    this.#yaw.velocity = this.#pitch.velocity = 0;
  }

  #startSpring(yaw: number, pitch: number, kind: Spring['kind'], timeMs: Spring['timeMs']): void {
    this.#yaw.target = yaw;
    this.#pitch.target = pitch;
    this.#spring = { kind, timeMs };
    this.#settleIfAtRest();
  }

  #settleIfAtRest(): void {
    for (const axis of [this.#yaw, this.#pitch]) {
      if (Math.abs(axis.value - axis.target) > ANGLE_EPSILON || Math.abs(axis.velocity) > VELOCITY_EPSILON) return;
    }
    this.#yaw.value = this.#yaw.target;
    this.#pitch.value = this.#pitch.target;
    this.stop();
  }
}
