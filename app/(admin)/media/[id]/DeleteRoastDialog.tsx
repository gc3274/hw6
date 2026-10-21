"use client";

import { useRef } from "react";
import SubmitButton from "@/components/SubmitButton";
import { button } from "@/components/ui";
import { deleteWarning } from "@/lib/media";
import { deleteRoast } from "../actions";

type DeleteRoastDialogProps = {
  id: string;
  // Up plus down; they are deleted with the row
  votes: number;
  // "roast", or "caption" for a legacy caption
  noun: "roast" | "caption";
};

// A native modal <dialog>: it traps focus, closes on Escape, and returns focus
// to the button that opened it. Confirming submits deleteRoast, which redirects.
export default function DeleteRoastDialog({ id, votes, noun }: DeleteRoastDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function open() {
    dialogRef.current?.showModal();
    // Start on the safe choice
    cancelRef.current?.focus();
  }

  return (
    <>
      <button type="button" onClick={open} className={button("danger")}>
        Delete {noun}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-title"
        aria-describedby="delete-warning"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-6 text-ink backdrop:bg-ink/40"
      >
        <h2 id="delete-title" className="text-lg font-semibold tracking-tight">
          Delete this {noun}?
        </h2>
        <p id="delete-warning" className="mt-2 text-sm text-muted">
          {deleteWarning(votes)}
        </p>
        <form action={deleteRoast} className="mt-6 flex flex-wrap justify-end gap-3">
          <input type="hidden" name="id" value={id} />
          <button
            ref={cancelRef}
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={button("secondary")}
          >
            Cancel
          </button>
          <SubmitButton variant="danger" pendingText="Deleting…">
            Delete {noun}
          </SubmitButton>
        </form>
      </dialog>
    </>
  );
}
