// Timers, portably. Node's let a process exit while one is pending if it's unref'd; other
// runtimes have no such thing, so this does nothing there.
export type Timer = ReturnType<typeof setTimeout>;

/** Don't keep a Node process alive just for this timer. Returns it. */
export function unref<T>(t: T): T {
  (t as { unref?: () => void }).unref?.();
  return t;
}
