"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { DOMAIN_MAX, type DomainState } from "@/lib/access";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL } from "@/lib/forms";

type DomainFormProps = {
  // createDomain or updateDomain
  action: (prev: DomainState, fd: FormData) => Promise<DomainState>;
  // Set when editing a saved domain
  id?: number;
  initial: string;
  submitLabel: string;
  pendingText: string;
};

// The add form on the list and the edit form on a domain's page. A create that
// works redirects back to the list, which remounts this with a new key.
export default function DomainForm({ action, id, initial, submitLabel, pendingText }: DomainFormProps) {
  const [state, formAction] = useActionState(action, FORM_INITIAL);
  // Controlled so React doesn't reset the field after each submit
  const [value, setValue] = useState(initial);
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<DomainState | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  const error = editedAfter === state ? undefined : state.errors?.apex_domain;
  const message = editedAfter === state ? "" : state.message;

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <div className="max-w-md">
        <FormField
          id="apex_domain"
          label="Domain"
          hint="Its subdomains are allowed too: columbia.edu also lets in cs.columbia.edu. A leading @ is dropped."
          count={`${codePoints(value)}/${DOMAIN_MAX}`}
          error={error}
        >
          <input
            id="apex_domain"
            name="apex_domain"
            type="text"
            inputMode="url"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="columbia.edu"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setEditedAfter(state);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy("apex_domain", { hint: true, count: true, error })}
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
