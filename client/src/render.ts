import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import { signal } from "./utils";

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
    this.onAdd(
      states.reduce<V[]>((created, state) => {
        if (this.views[state.id]) return created;
        this.views[state.id] = this.construct(state);
        return [...created, this.views[state.id]];
      }, [])
    );
  }

  delete(ids: string[]) {
    this.onDelete(
      ids.reduce<V[]>((deleted, id) => {
        const view = this.views[id];
        delete this.views[id];
        return view ? [...deleted, view] : deleted;
      }, [])
    );
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

export interface StageView {
  render: Render<any, any>;
  SIDeep: string | null;
}

export class Stage<K extends string> {
  constructor(
    public readonly SI: SnapshotInterpolation,
    public readonly views: Record<K, StageView>
  ) {}

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

  forEarch(cb: (view: StageView, type: K) => any) {
    for (const type in this.views) {
      cb(this.views[type], type);
    }
    return this;
  }
}
