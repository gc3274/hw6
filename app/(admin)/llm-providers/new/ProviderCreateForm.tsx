"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { CALLABLE_PROVIDER } from "@/lib/chains";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL, type FormState } from "@/lib/forms";
import { PROVIDER_NAME_MAX, type ProviderField } from "@/lib/llm";
import { createProvider } from "../actions";

type Values = { name: string; slug: string };

export default function ProviderCreateForm() {
  const [state, formAction] = useActionState(createProvider, FORM_INITIAL);
  // Controlled so React doesn't reset the fields after a refused submit
  const [values, setValues] = useState<Values>({ name: "", slug: "" });
  // The result the admin has typed over since; its errors are stale now
  const [editedAfter, setEditedAfter] = useState<FormState<ProviderField> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function update(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormField
        id="name"
        label="Name"
        hint="How it’s shown in this admin area, e.g. Google."
        count={`${codePoints(values.name)}/${PROVIDER_NAME_MAX}`}
        error={errors.name}
      >
        <input
          id="name"
          name="name"
          required
          autoComplete="off"
          value={values.name}
          onChange={update}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name", { hint: true, count: true, error: errors.name })}
          className={input}
        />
      </FormField>

      <FormField
        id="slug"
        label="Slug"
        hint={
          <>
            2 to 30 lowercase letters, digits or hyphens. It can’t change later: the app matches
            providers by slug, and only “{CALLABLE_PROVIDER}” has a client.
          </>
        }
        error={errors.slug}
      >
        <input
          id="slug"
          name="slug"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={values.slug}
          onChange={update}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={describedBy("slug", { hint: true, error: errors.slug })}
          className={`${input} font-mono sm:max-w-xs`}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText="Adding…">Add provider</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
