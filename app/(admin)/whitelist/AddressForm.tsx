"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { EMAIL_MAX, type EmailState } from "@/lib/access";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL } from "@/lib/forms";

type AddressFormProps = {
  // createAddress or updateAddress
  action: (prev: EmailState, fd: FormData) => Promise<EmailState>;
  // Set when editing a saved address
  id?: number;
  initial: string;
  submitLabel: string;
  pendingText: string;
};

// The add form on the list and the edit form on an address's page. A create that
// works redirects back to the list, which remounts this with a new key.
export default function AddressForm({ action, id, initial, submitLabel, pendingText }: AddressFormProps) {
  const [state, formAction] = useActionState(action, FORM_INITIAL);
  // Controlled so React doesn't reset the field after each submit
  const [value, setValue] = useState(initial);
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<EmailState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const error = editedAfter === state ? undefined : state.errors?.email_address;
  const message = editedAfter === state ? "" : state.message;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <div className="max-w-md">
        {/* type="text": the browser's email check is stricter than the table's */}
        <FormField
          id="email_address"
          label="Email address"
          hint="This one address can sign up, whatever its domain. Capitals don’t matter."
          count={`${codePoints(value)}/${EMAIL_MAX}`}
          error={error}
        >
          <input
            id="email_address"
            name="email_address"
            type="text"
            inputMode="email"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="someone@gmail.com"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setEditedAfter(state);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("email_address", { hint: true, count: true, error })}
            className={input}
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
