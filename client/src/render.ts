export class Signal<T> {
  constructor(public readonly listeners = new Set<(data: T) => unknown>()) {}

  emit(data: T) {
    this.listeners.forEach((listen) => listen(data));
  }

  listen(listener: (data: T) => unknown) {
    this.listeners.add(listener);
  }
}

export interface State {
  id: string;
}

export abstract class View<S extends State, V> {
  public readonly id: string;

  constructor(public readonly view: V, state: S) {
    this.id = state.id;
  }

  abstract render(state: S): any;
}

export interface ViewConstructor<
  V extends View<S, unknown>,
  S extends State,
  C = any
> {
  SIDeep: string;
  new (context: C, state: S): V;
}

export class Container<V extends View<S, unknown>, S extends State, C = any> {
  public readonly map = new Map<string, V>();

  public readonly onCreate = new Signal<V[]>();

  public readonly onDelete = new Signal<V[]>();

  constructor(public readonly construct: ViewConstructor<V, S>) {}

  init(context: C, ...states: S[]) {
    states.forEach((state) => this.create(context, state));
  }

  create(context: C, ...states: S[]) {
    const created = states.reduce<V[]>((created, state) => {
      const view = new this.construct(context, state);
      view.render(state);
      this.map.set(state.id, view);
      return [...created, view];
    }, []);
    this.onCreate.emit(created);
  }

  delete(...ids: string[]) {
    const deleted = ids.reduce<V[]>((deleted, id) => {
      const view = this.map.get(id);
      this.map.delete(id);
      return view ? [...deleted, view] : deleted;
    }, []);
    this.onDelete.emit(deleted);
  }

  render(states: Array<S>) {
    states.forEach((state) => this.map.get(state.id)?.render(state));
  }
}
