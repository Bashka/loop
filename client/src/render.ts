import { ClientChannel } from "@geckos.io/client";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import { Model as Serializer } from "@geckos.io/typed-array-buffer-schema";
import { signal, Signal } from "../../server/src/signal";

interface Animator {
  onFrame: Signal<null>;
  play(): this;
  stop(): this;
}

export class RequestFrameAnimator implements Animator {
  protected _isStoped = true;

  public readonly onFrame = signal<null>();

  protected animate() {
    if (this._isStoped) return;
    requestAnimationFrame(this.animate.bind(this));
    this.onFrame(null);
  }

  play() {
    if (!this._isStoped) return this;
    this._isStoped = false;
    this.animate();
    return this;
  }

  stop() {
    if (this._isStoped) return this;
    this._isStoped = true;
    return this;
  }
}

export interface State {
  id: string;
}

export interface Patch<S extends State> {
  add?: S[];
  upd?: S[];
  del?: string[];
}

export function isPatch(patch: any): patch is Patch<any> {
  if (typeof patch !== "object" || patch === null) return false;
  if (typeof patch.add === "object" && !Array.isArray(patch.add)) return false;
  if (typeof patch.upd === "object" && !Array.isArray(patch.upd)) return false;
  if (typeof patch.del === "object" && !Array.isArray(patch.del)) return false;

  return true;
}

export class Render<S extends State, V = any> {
  public readonly views: Record<string, V> = {};
  public readonly onAdd = signal<V[]>();
  public readonly onDelete = signal<V[]>();

  constructor(
    public readonly construct: (state: S) => V,
    public readonly render: (state: S, view: V) => any
  ) {}

  add(states: S[]) {
    const added = states.reduce<V[]>((created, state) => {
      if (this.views[state.id]) return created;
      this.views[state.id] = this.construct(state);
      return [...created, this.views[state.id]];
    }, []);
    if (added.length > 0) this.onAdd(added);
  }

  delete(ids: string[]) {
    const deleted = ids.reduce<V[]>((deleted, id) => {
      const view = this.views[id];
      delete this.views[id];
      return view ? [...deleted, view] : deleted;
    }, []);
    if (deleted.length > 0) this.onDelete(deleted);
  }

  update(states: S[]) {
    states.map((state) => {
      const view = this.views[state.id];
      if (view) this.render(state, view);
    });
  }

  patch({ add, upd, del }: Patch<S>) {
    del && this.delete(del);
    upd && this.update(upd);
    add && this.add(add);
  }
}

export interface View<S extends State, V = any> {
  render: Render<S, V>;
  SIDeep?: string;
}

export interface StageOptions {
  channel: ClientChannel;
  SI?: SnapshotInterpolation;
  serializer: Serializer;
  fps?: number;
  animator?: Animator;
}

export class Stage<K extends string> {
  public readonly channel: ClientChannel;

  public readonly SI: SnapshotInterpolation;

  public readonly serializer: Serializer;

  public readonly animator: Animator;

  public readonly onAdd = signal<any[]>();

  public readonly onDelete = signal<any[]>();

  constructor(
    public readonly views: Record<K, View<any, any>>,
    options: StageOptions
  ) {
    this.channel = options.channel;
    this.serializer = options.serializer;
    this.SI = options.SI ?? new SnapshotInterpolation(options.fps ?? 50);
    this.animator = options.animator ?? new RequestFrameAnimator();

    for (const name in views) {
      views[name].render.onAdd((created) => this.onAdd(created));
      views[name].render.onDelete((created) => this.onDelete(created));
    }
    this.channel.on(
      "patch",
      (patch) => typeof patch === "object" && this.patch(patch)
    );
    this.channel.onRaw(
      (buffer) =>
        buffer instanceof ArrayBuffer &&
        this.SI.snapshot.add(this.serializer.fromBuffer(buffer))
    );
    this.animator
      .play()
      .onFrame(() =>
        this.interpolate(
          (this.serializer.schema.struct as { state: object }).state
        )
      );
  }

  hasView(key: any): key is K {
    return (
      typeof key === "string" &&
      Object.prototype.hasOwnProperty.call(this.views, key)
    );
  }

  view(key: string) {
    return this.hasView(key) ? this.views[key] : undefined;
  }

  patch(patch: object) {
    Object.entries(patch).forEach(
      ([type, patch]) => isPatch(patch) && this.view(type)?.render.patch(patch)
    );
    return this;
  }

  interpolate(state: object) {
    Object.keys(state).forEach((type) => {
      const view = this.view(type);
      if (!view || !view.SIDeep) return;
      const snap = this.SI.calcInterpolation(view.SIDeep, type);
      if (snap) view.render.update(snap.state);
    });
    return this;
  }
}

export interface Room {
  onCreated: Signal<Stage<any> | Error>;
}
