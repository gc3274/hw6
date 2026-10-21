"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import SubmitButton from "@/components/SubmitButton";
import { input, label } from "@/components/ui";
import { CAPTION_MAX } from "@/lib/captions";
import { codePoints } from "@/lib/format";
import { PUBLISH_REFUSED, type EditField, type EditState } from "@/lib/media";
import { RATING_MAX, TIP_MAX } from "@/lib/roasts";
import { updateRoast } from "../actions";

type RoastEditFormProps = {
  id: string;
  // Legacy captions have no tip or score, so only the words and visibility show
  legacy: boolean;
  content: string;
  tip: string | null;
  rating: number | null;
  isPublic: boolean;
  // The owner never posted it, so Public is off (the server refuses it too)
  publishLocked: boolean;
};

type Values = { content: string; tip: string; rating: string; is_public: "true" | "false" };

const initialState: EditState = { ok: false, message: "" };

export default function RoastEditForm({
  id,
  legacy,
  content,
  tip,
  rating,
  isPublic,
  publishLocked,
}: RoastEditFormProps) {
  const [state, formAction] = useActionState(updateRoast, initialState);
  // Controlled so React doesn't reset the fields after each submit
  const [values, setValues] = useState<Values>({
    content,
    tip: tip ?? "",
    rating: rating === null ? "" : String(rating),
    is_public: isPublic ? "true" : "false",
  });
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<EditState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function update(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;
  const describedBy = (field: EditField, ...ids: string[]) =>
    [...ids, errors[field] ? `${field}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={id} />

      <Field
        id="content"
        label={legacy ? "Caption" : "Roast"}
        count={`${codePoints(values.content)}/${CAPTION_MAX}`}
        error={errors.content}
      >
        <textarea
          id="content"
          name="content"
          rows={4}
          required
          value={values.content}
          onChange={update}
          aria-invalid={errors.content ? true : undefined}
          aria-describedby={describedBy("content", "content-count")}
          className={`${input} resize-y`}
        />
      </Field>

      {!legacy && (
        <>
          <Field
            id="tip"
            label="Tip"
            hint="Leave it empty for no tip."
            count={`${codePoints(values.tip)}/${TIP_MAX}`}
            error={errors.tip}
          >
            <textarea
              id="tip"
              name="tip"
              rows={2}
              value={values.tip}
              onChange={update}
              aria-invalid={errors.tip ? true : undefined}
              aria-describedby={describedBy("tip", "tip-hint", "tip-count")}
              className={`${input} resize-y`}
            />
          </Field>

          <Field
            id="rating"
            label="Score"
            hint={`A whole number from 0 to ${RATING_MAX}. Leave it empty for unscored.`}
            error={errors.rating}
          >
            <input
              id="rating"
              name="rating"
              type="number"
              inputMode="numeric"
              min={0}
              max={RATING_MAX}
              step={1}
              value={values.rating}
              onChange={update}
              aria-invalid={errors.rating ? true : undefined}
              aria-describedby={describedBy("rating", "rating-hint")}
              className={`${input} w-24`}
            />
          </Field>
        </>
      )}

      {/* A radio group, so it can carry aria-invalid and take focus when refused */}
      <fieldset
        role="radiogroup"
        aria-invalid={errors.is_public ? true : undefined}
        aria-describedby={describedBy("is_public", publishLocked ? "is_public-hint" : "")}
        tabIndex={errors.is_public ? -1 : undefined}
        className="rounded-sm"
      >
        <legend className={label}>Visibility</legend>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          <Choice
            value="true"
            checked={values.is_public === "true"}
            disabled={publishLocked}
            onChange={update}
          >
            Public
          </Choice>
          <Choice value="false" checked={values.is_public === "false"} onChange={update}>
            Private
          </Choice>
        </div>
        {publishLocked && (
          <p id="is_public-hint" className="mt-2 max-w-prose text-sm text-muted">
            {PUBLISH_REFUSED}
          </p>
        )}
        {errors.is_public && (
          <p id="is_public-error" className="mt-2 text-sm text-danger">
            {errors.is_public}
          </p>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}

function Field({
  id,
  label: text,
  hint,
  count,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  count?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className={label}>
          {text}
        </label>
        {count && (
          <span id={`${id}-count`} className="text-xs text-muted tabular-nums">
            <span className="sr-only">Characters used: </span>
            {count}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Choice({
  value,
  checked,
  disabled = false,
  onChange,
  children,
}: {
  value: "true" | "false";
  checked: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  children: ReactNode;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "text-muted" : ""}`}>
      <input
        type="radio"
        name="is_public"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 accent-accent"
      />
      {children}
    </label>
  );
}
