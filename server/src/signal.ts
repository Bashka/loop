export interface Signal<T> {
  (listener: T | ((data: T) => unknown)): any;
}

export function signal<T>(
  listener: (data: T) => unknown = () => {}
): Signal<T> {
  return (d: typeof listener | T) =>
    typeof d === "function" ? (listener = d as typeof listener) : listener(d);
}
