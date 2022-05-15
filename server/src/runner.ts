import { Signal, signal } from "./signal.js";

export interface Runner {
  onTick: Signal<number>;
  isPaused: boolean;
  play(): this;
  pause(): this;
}

export class IntervalRunner implements Runner {
  protected _isPaused = true;

  protected _timer!: NodeJS.Timer;

  public readonly onTick = signal<number>();

  constructor(public readonly fps: number) {}

  get isPaused() {
    return this._isPaused;
  }

  pause() {
    if (this._isPaused) return this;
    this._isPaused = true;
    clearInterval(this._timer);
    return this;
  }

  play() {
    if (!this._isPaused) return this;
    this._isPaused = false;
    this._timer = setInterval(() => this.onTick(this.fps), this.fps);
    return this;
  }
}
