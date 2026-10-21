"use client";

import { useActionState, useState } from "react";
import Badge from "@/components/Badge";
import SubmitButton from "@/components/SubmitButton";
import { errorBox, label } from "@/components/ui";
import type { CreateState } from "@/lib/media";
import { createRoast } from "../actions";

export type CriticChoice = {
  id: number;
  name: string;
  emoji: string;
  // The topic label for an expert, or null for the general panel
  expertIn: string | null;
  // Roasts this critic already has on the post
  existing: number;
};

type CreateRoastFormProps = {
  imageId: string;
  choices: CriticChoice[];
  // The first critic with no roast yet, or null when every critic has one
  preselect: number | null;
};

const initialState: CreateState = { error: null };

export default function CreateRoastForm({ imageId, choices, preselect }: CreateRoastFormProps) {
  const [state, formAction, pending] = useActionState(createRoast, initialState);
  // Controlled so a failed try keeps the admin's pick instead of resetting the form
  const [criticId, setCriticId] = useState(preselect === null ? "" : String(preselect));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="imageId" value={imageId} />

      <fieldset disabled={pending} aria-describedby={state.error ? "create-error" : undefined}>
        <legend className={label}>Critic</legend>
        <p className="mt-1 text-sm text-muted">
          Only this post’s panel: its topic expert and the general critics.
        </p>
        <ul className="mt-3 space-y-2">
          {choices.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 has-checked:border-accent has-checked:bg-accent/5 has-disabled:cursor-not-allowed">
                <input
                  type="radio"
                  name="criticId"
                  value={c.id}
                  required
                  checked={criticId === String(c.id)}
                  onChange={(event) => setCriticId(event.target.value)}
                  className="size-4 shrink-0 accent-accent"
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">
                    <span aria-hidden="true">{c.emoji}</span> {c.name}
                  </span>
                  <span className="text-sm text-muted">
                    {c.expertIn ? `${c.expertIn} expert` : "General panel"}
                  </span>
                  {c.existing > 0 && (
                    <Badge>Already has {c.existing === 1 ? "1 roast" : `${c.existing} roasts`}</Badge>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {state.error && (
        <p id="create-error" role="alert" className={errorBox}>
          {state.error}
        </p>
      )}

      <SubmitButton pendingText="Generating, about 10 seconds">Generate roast</SubmitButton>
    </form>
  );
}
