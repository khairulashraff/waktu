import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { subscribeToasts } from "../toast";
import type { Toast } from "../toast";

// Renders active toasts bottom-right. Kept above everything (z-50) and readable
// on the kiosk's photo background (solid red, own text-shadow reset).
export default function Toaster(): ReactElement | null {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="max-w-md rounded bg-red-600 px-4 py-2 text-sm text-white shadow-lg [text-shadow:none]"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
