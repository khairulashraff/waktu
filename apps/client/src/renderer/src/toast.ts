// Minimal dependency-free toast bus. `showToast` from anywhere; a <Toaster />
// component subscribes and renders. Identical messages (e.g. a fetch that retries
// every second) refresh the existing toast's timer instead of stacking duplicates.

export interface Toast {
  id: number;
  message: string;
}

type Listener = (toasts: Toast[]) => void;

const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let toasts: Toast[] = [];
let nextId = 1;

function emit(): void {
  for (const listener of listeners) listener(toasts);
}

function dismiss(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  emit();
}

export function showToast(message: string, timeoutMs = 8000): void {
  const existing = toasts.find((t) => t.message === message);
  const id = existing ? existing.id : nextId++;
  if (!existing) {
    toasts = [...toasts, { id, message }];
    emit();
  }
  const prev = timers.get(id);
  if (prev) clearTimeout(prev);
  timers.set(id, setTimeout(() => dismiss(id), timeoutMs));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}
