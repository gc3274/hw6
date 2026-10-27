"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { CALLABLE_PROVIDER } from "@/lib/chains";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL, type FormState } from "@/lib/forms";
import { PROVIDER_NAME_MAX, type ProviderField } from "@/lib/llm";
import { updateProvider } from "../actions";

type ProviderEditFormProps = { id: number; name: string; slug: string };

export default function ProviderEditForm({ id, name, slug }: ProviderEditFormProps) {
  const [state, formAction] = useActionState(updateProvider, FORM_INITIAL);
  // Controlled so React doesn't reset the field after each submit
  const [value, setValue] = useState(name);
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<FormState<ProviderField> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function update(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={id} />

      <FormField id="name" label="Name" count={`${codePoints(value)}/${PROVIDER_NAME_MAX}`} error={errors.name}>
        <input
          id="name"
          name="name"
          required
          autoComplete="off"
          value={value}
          onChange={update}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name", { count: true, error: errors.name })}
          className={input}
        />
      </FormField>

      {/* No name attribute: the slug is never sent, and updateProvider never saves one */}
      <FormField
        id="slug"
        label="Slug"
        hint={
          <>
            Can’t be changed. The app matches providers by slug, and only “{CALLABLE_PROVIDER}” has
            a client.
          </>
        }
      >
        <input
          id="slug"
          readOnly
          value={slug}
          aria-describedby={describedBy("slug", { hint: true })}
          className={`${input} bg-canvas font-mono text-muted sm:max-w-xs`}
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
