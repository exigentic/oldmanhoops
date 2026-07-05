"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Minimal confirmation dialog built on the native <dialog> element, driven
 * imperatively via a ref so we get the browser's focus trap, Escape handling,
 * and ::backdrop for free. Escape and backdrop clicks both resolve to onCancel.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Native Escape fires a 'cancel' event; treat it as a plain cancel.
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // A click whose target is the <dialog> element itself landed on the
        // backdrop (content lives in the inner wrapper below).
        if (e.target === ref.current) onCancel();
      }}
      className="m-auto rounded-xl p-0 backdrop:bg-black/40 open:animate-none"
    >
      <div className="flex flex-col gap-4 p-6 max-w-xs">
        <p id={titleId} className="text-base text-neutral-900">
          {title}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-neutral-700 bg-stone-200 hover:brightness-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
