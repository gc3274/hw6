"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { TERMS_MAX } from "@/lib/chains";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL } from "@/lib/forms";
import { TOPICS } from "@/lib/roasts";
import {
  DEFINITION_MAX,
  PRIORITY_MAX,
  TERM_EXAMPLE_MAX,
  TERM_MAX,
  type TermFormValues,
  type TermState,
} from "@/lib/terms";

type TermFormProps = {
  // createTerm or updateTerm
  action: (prev: TermState, fd: FormData) => Promise<TermState>;
  // Set when editing a saved term
  id?: number;
  initial: TermFormValues;
  submitLabel: string;
  pendingText: string;
};

// The add and edit form. A create that works redirects to the new term's page.
export default function TermForm({ action, id, initial, submitLabel, pendingText }: TermFormProps) {
  const [state, formAction] = useActionState(action, FORM_INITIAL);
  // Controlled so React doesn't reset the fields after each submit
  const [values, setValues] = useState<TermFormValues>(initial);
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<TermState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

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

      <FormField id="term" label="Term" count={`${codePoints(values.term)}/${TERM_MAX}`} error={errors.term}>
        <input
          id="term"
          name="term"
          type="text"
          required
          autoComplete="off"
          value={values.term}
          onChange={update}
          aria-invalid={errors.term ? true : undefined}
          aria-describedby={describedBy("term", { count: true, error: errors.term })}
          className={input}
        />
      </FormField>

      <FormField
        id="definition"
        label="Definition"
        hint="What it means, in words the critics can work from."
        count={`${codePoints(values.definition)}/${DEFINITION_MAX}`}
        error={errors.definition}
      >
        <textarea
          id="definition"
          name="definition"
          rows={3}
          required
          value={values.definition}
          onChange={update}
          aria-invalid={errors.definition ? true : undefined}
          aria-describedby={describedBy("definition", { hint: true, count: true, error: errors.definition })}
          className={`${input} resize-y`}
        />
      </FormField>

      <FormField
        id="example"
        label="Example"
        hint="Optional: a sentence that uses it. Leave it empty for none."
        count={`${codePoints(values.example)}/${TERM_EXAMPLE_MAX}`}
        error={errors.example}
      >
        <textarea
          id="example"
          name="example"
          rows={2}
          value={values.example}
          onChange={update}
          aria-invalid={errors.example ? true : undefined}
          aria-describedby={describedBy("example", { hint: true, count: true, error: errors.example })}
          className={`${input} resize-y`}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
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
            className={input}
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
          id="priority"
          label="Priority"
          hint={`0 to ${PRIORITY_MAX}. Higher goes first; only the top ${TERMS_MAX} for a topic reach the prompt.`}
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
