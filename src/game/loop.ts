export interface FixedLoopOptions {
  /** Length of one simulation tick, seconds. */
  tickSeconds: number;
  /** Runs one simulation tick. */
  step: () => void;
  /** Draws a frame. `alpha` is how far we are between the last two ticks, 0..1. */
  render: (alpha: number, frameSeconds: number, nowSeconds: number) => void;
  /** Longest frame we simulate, so a background tab can't cause a catch-up spiral. */
  maxFrameSeconds?: number;
}

export interface FixedLoop {
  start(): void;
  stop(): void;
}

/** A fixed-timestep loop: the simulation ticks at a steady rate, rendering runs at the display's rate. */
export function createFixedLoop(options: FixedLoopOptions): FixedLoop {
  const maxFrame = options.maxFrameSeconds ?? 0.25;
  let handle = 0;
  let last = -1;
  let accumulator = 0;

  const frame = (nowMs: number) => {
    handle = requestAnimationFrame(frame);
    const now = nowMs / 1000;
    const frameSeconds = last < 0 ? 0 : Math.min(now - last, maxFrame);
    last = now;
    accumulator += frameSeconds;
    while (accumulator >= options.tickSeconds) {
      options.step();
      accumulator -= options.tickSeconds;
    }
    options.render(accumulator / options.tickSeconds, frameSeconds, now);
  };

  return {
    start() {
      if (handle) return;
      last = -1;
      handle = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(handle);
      handle = 0;
    },
  };
}
