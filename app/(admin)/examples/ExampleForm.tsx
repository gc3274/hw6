"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { EXAMPLES_MAX } from "@/lib/chains";
import {
  EXAMPLE_ROAST_MAX,
  EXAMPLE_TIP_MAX,
  EXPLANATION_MAX,
  PHOTO_MAX,
  type ExampleFormValues,
  type ExampleState,
} from "@/lib/examples";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL } from "@/lib/forms";
import { restoreChoices } from "@/lib/restore-choices";
import { RATING_MAX, TOPICS } from "@/lib/roasts";
import { PRIORITY_MAX } from "@/lib/terms";

type ExampleFormProps = {
  // createExample or updateExample
  action: (prev: ExampleState, fd: FormData) => Promise<ExampleState>;
  // Set when editing a saved example
  id?: number;
  initial: ExampleFormValues;
  submitLabel: string;
  pendingText: string;
};

// The add and edit form. A create that works redirects to the new example's page.
export default function ExampleForm({ action, id, initial, submitLabel, pendingText }: ExampleFormProps) {
  const [state, formAction] = useActionState(action, FORM_INITIAL);
  // Controlled so React doesn't reset the fields after each submit
  const [values, setValues] = useState<ExampleFormValues>(initial);
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<ExampleState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // React resets the form after each submit; put the choices back from state
  useEffect(() => {
    restoreChoices(formRef.current, values);
  }, [state, values]);

  function update(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <FormField
        id="topic"
        label="Topic"
        hint="Every topic puts it in every photo’s prompt."
        error={errors.topic}
      >
        <select
          id="topic"
          name="topic"
          value={values.topic}
          onChange={update}
          aria-invalid={errors.topic ? true : undefined}
          aria-describedby={describedBy("topic", { hint: true, error: errors.topic })}
          className={`${input} sm:w-64`}
        >
          <option value="">Every topic</option>
          {TOPICS.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.emoji} {t.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id="image_description"
        label="Photo"
        hint="What the photo shows. The model only reads these words, never sees a picture."
        count={`${codePoints(values.image_description)}/${PHOTO_MAX}`}
        error={errors.image_description}
      >
        <textarea
          id="image_description"
          name="image_description"
          rows={3}
          required
          value={values.image_description}
          onChange={update}
          aria-invalid={errors.image_description ? true : undefined}
          aria-describedby={describedBy("image_description", {
            hint: true,
            count: true,
            error: errors.image_description,
          })}
          className={`${input} resize-y`}
        />
      </FormField>

      <FormField
        id="roast"
        label="Roast"
        hint={`Up to ${EXAMPLE_ROAST_MAX} characters, the same length the critics are asked for.`}
        count={`${codePoints(values.roast)}/${EXAMPLE_ROAST_MAX}`}
        error={errors.roast}
      >
        <textarea
          id="roast"
          name="roast"
          rows={2}
          required
          value={values.roast}
          onChange={update}
          aria-invalid={errors.roast ? true : undefined}
          aria-describedby={describedBy("roast", { hint: true, count: true, error: errors.roast })}
          className={`${input} resize-y`}
        />
      </FormField>

      <FormField
        id="tip"
        label="Tip"
        hint="Optional. Leave it empty for no tip."
        count={`${codePoints(values.tip)}/${EXAMPLE_TIP_MAX}`}
        error={errors.tip}
      >
        <textarea
          id="tip"
          name="tip"
          rows={2}
          value={values.tip}
          onChange={update}
          aria-invalid={errors.tip ? true : undefined}
          aria-describedby={describedBy("tip", { hint: true, count: true, error: errors.tip })}
          className={`${input} resize-y`}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="score"
          label="Score"
          hint={`A whole number from 0 to ${RATING_MAX}, as harsh as you want the critics to be.`}
          error={errors.score}
        >
          <input
            id="score"
            name="score"
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={RATING_MAX}
            step={1}
            value={values.score}
            onChange={update}
            aria-invalid={errors.score ? true : undefined}
            aria-describedby={describedBy("score", { hint: true, error: errors.score })}
            className={`${input} w-24`}
          />
        </FormField>

        <FormField
          id="priority"
          label="Priority"
          hint={`0 to ${PRIORITY_MAX}. Higher goes first; only the top ${EXAMPLES_MAX} for a topic reach the prompt.`}
          error={errors.priority}
        >
          <input
            id="priority"
            name="priority"
            type="number"
            inputMode="numeric"
            min={0}
            max={PRIORITY_MAX}
            step={1}
            value={values.priority}
            onChange={update}
            aria-invalid={errors.priority ? true : undefined}
            aria-describedby={describedBy("priority", { hint: true, error: errors.priority })}
            className={`${input} w-24`}
          />
        </FormField>
      </div>

      <FormField
        id="explanation"
        label="Why it works"
        hint="What the critics should take from it: the detail it picks on, the tone, the score."
        count={`${codePoints(values.explanation)}/${EXPLANATION_MAX}`}
        error={errors.explanation}
      >
        <textarea
          id="explanation"
          name="explanation"
          rows={3}
          required
          value={values.explanation}
          onChange={update}
          aria-invalid={errors.explanation ? true : undefined}
          aria-describedby={describedBy("explanation", { hint: true, count: true, error: errors.explanation })}
          className={`${input} resize-y`}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
