"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import Badge from "@/components/Badge";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input, label } from "@/components/ui";
import { CONTEXT_MAX } from "@/lib/captions";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL, type FormState } from "@/lib/forms";
import { TOPIC_LOCKED, type ImageField, type TopicLock } from "@/lib/images";
import { restoreChoices } from "@/lib/restore-choices";
import { topicInfo, TOPICS } from "@/lib/roasts";
import { updateImage } from "../actions";

type ImageEditFormProps = {
  id: string;
  note: string | null;
  topic: string | null;
  // Why the topic can't change, or null when it can (the server checks again)
  lock: TopicLock | null;
};

type Values = { context: string; topic: string };

export default function ImageEditForm({ id, note, topic, lock }: ImageEditFormProps) {
  const [state, formAction] = useActionState(updateImage, FORM_INITIAL);
  // Controlled so React doesn't reset the fields after each submit
  const [values, setValues] = useState<Values>({ context: note ?? "", topic: topic ?? "" });
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<FormState<ImageField> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // React resets the form after each submit; put the choices back from state
  useEffect(() => {
    restoreChoices(formRef.current, values);
  }, [state, values]);

  function update(event: ChangeEvent<HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;
  const current = topicInfo(topic);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={id} />

      <FormField
        id="context"
        label="Note for the critics"
        hint="Private: it goes into the prompt and is never shown in the app. Leave it empty for no note."
        count={`${codePoints(values.context)}/${CONTEXT_MAX}`}
        error={errors.context}
      >
        <textarea
          id="context"
          name="context"
          rows={2}
          value={values.context}
          onChange={update}
          aria-invalid={errors.context ? true : undefined}
          aria-describedby={describedBy("context", { hint: true, count: true, error: errors.context })}
          className={`${input} resize-y`}
        />
      </FormField>

      {lock ? (
        // No topic field at all, so nothing is sent and updateImage keeps the topic
        <div className="flex flex-col gap-1">
          <p className={label}>Topic</p>
          <p className="text-sm">
            {current ? (
              <>
                <span aria-hidden="true">{current.emoji}</span> {current.label}
              </>
            ) : (
              <Badge>Legacy</Badge>
            )}
          </p>
          <p className="max-w-prose text-sm text-muted">{TOPIC_LOCKED[lock]}</p>
        </div>
      ) : (
        <FormField
          id="topic"
          label="Topic"
          hint="Can change only while the photo has no roasts, because the topic picks its critic panel."
          error={errors.topic}
        >
          <select
            id="topic"
            name="topic"
            required
            value={values.topic}
            onChange={update}
            aria-invalid={errors.topic ? true : undefined}
            aria-describedby={describedBy("topic", { hint: true, error: errors.topic })}
            className={`${input} sm:max-w-xs`}
          >
            {TOPICS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
