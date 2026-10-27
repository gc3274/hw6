"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import FormField, { describedBy } from "@/components/FormField";
import SubmitButton from "@/components/SubmitButton";
import { input } from "@/components/ui";
import { FALLBACK_MODEL } from "@/lib/chains";
import { codePoints } from "@/lib/format";
import { FORM_INITIAL, type FormState } from "@/lib/forms";
import {
  isCallable,
  MODEL_NAME_MAX,
  PROVIDER_MODEL_ID_MAX,
  THINKING_LEVELS,
  THINKING_NOTE,
  thinkingLabel,
  UNCALLABLE_NOTE,
  type ModelField,
} from "@/lib/llm";
import { createModel, updateModel } from "./actions";

type ProviderChoice = { id: number; name: string; slug: string };

type ModelFormProps = {
  providers: ProviderChoice[];
  // Set when editing an existing model; a new one starts empty
  model?: {
    id: number;
    name: string;
    providerId: number;
    providerModelId: string;
    temperatureSupported: boolean;
    thinkingLevel: string | null;
  };
  // A new model's provider, e.g. from the provider page's "Add a model" link
  providerId?: number | null;
};

type Values = {
  name: string;
  llm_provider_id: string;
  provider_model_id: string;
  is_temperature_supported: boolean;
  thinking_level: string;
};

export default function ModelForm({ providers, model, providerId = null }: ModelFormProps) {
  const [state, formAction] = useActionState(model ? updateModel : createModel, FORM_INITIAL);
  // Controlled so React doesn't reset the fields after each submit
  const [values, setValues] = useState<Values>({
    name: model?.name ?? "",
    llm_provider_id: String(model?.providerId ?? providerId ?? providers[0]?.id ?? ""),
    provider_model_id: model?.providerModelId ?? "",
    // Off by default, like the column: a model that refuses temperature would answer 400 and fall back
    is_temperature_supported: model?.temperatureSupported ?? false,
    thinking_level: model?.thinkingLevel ?? "",
  });
  // The result the admin has typed over since; its message ("Saved") is stale now
  const [editedAfter, setEditedAfter] = useState<FormState<ModelField> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  function update(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    const next = event.target instanceof HTMLInputElement && event.target.type === "checkbox" ? event.target.checked : value;
    setValues((prev) => ({ ...prev, [name]: next }));
    setEditedAfter(state);
  }

  const errors = editedAfter === state ? {} : (state.errors ?? {});
  const message = editedAfter === state ? "" : state.message;
  const chosen = providers.find((p) => String(p.id) === values.llm_provider_id);
  const uncallable = chosen !== undefined && !isCallable(chosen.slug);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {model && <input type="hidden" name="id" value={model.id} />}

      <FormField
        id="name"
        label="Name"
        hint="How it’s shown in this admin area, e.g. Gemini 3.5 Flash."
        count={`${codePoints(values.name)}/${MODEL_NAME_MAX}`}
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
        id="llm_provider_id"
        label="Provider"
        hint={uncallable ? <span className="text-danger">{UNCALLABLE_NOTE}</span> : undefined}
        error={errors.llm_provider_id}
      >
        <select
          id="llm_provider_id"
          name="llm_provider_id"
          required
          value={values.llm_provider_id}
          onChange={update}
          aria-invalid={errors.llm_provider_id ? true : undefined}
          aria-describedby={describedBy("llm_provider_id", { hint: uncallable, error: errors.llm_provider_id })}
          className={`${input} sm:max-w-xs`}
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.slug})
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id="provider_model_id"
        label="Model ID"
        hint={
          <>
            The ID sent to the provider’s API, e.g. gemini-3.5-flash. Steps that use this model call
            it on the next roast run, so a wrong ID makes every run fall back to {FALLBACK_MODEL}.
          </>
        }
        count={`${codePoints(values.provider_model_id)}/${PROVIDER_MODEL_ID_MAX}`}
        error={errors.provider_model_id}
      >
        <input
          id="provider_model_id"
          name="provider_model_id"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={values.provider_model_id}
          onChange={update}
          aria-invalid={errors.provider_model_id ? true : undefined}
          aria-describedby={describedBy("provider_model_id", {
            hint: true,
            count: true,
            error: errors.provider_model_id,
          })}
          className={`${input} font-mono`}
        />
      </FormField>

      <div className="flex flex-col gap-1">
        <label className="flex w-fit items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            id="is_temperature_supported"
            name="is_temperature_supported"
            value="true"
            checked={values.is_temperature_supported}
            onChange={update}
            aria-describedby="is_temperature_supported-hint"
            className="size-4 accent-accent"
          />
          Supports temperature
        </label>
        <p id="is_temperature_supported-hint" className="text-sm text-muted">
          When it’s off, steps don’t send their temperature to this model.
        </p>
      </div>

      <FormField id="thinking_level" label="Thinking level" hint={THINKING_NOTE} error={errors.thinking_level}>
        <select
          id="thinking_level"
          name="thinking_level"
          value={values.thinking_level}
          onChange={update}
          aria-invalid={errors.thinking_level ? true : undefined}
          aria-describedby={describedBy("thinking_level", { hint: true, error: errors.thinking_level })}
          className={`${input} sm:max-w-xs`}
        >
          <option value="">{thinkingLabel(null)}</option>
          {THINKING_LEVELS.map((level) => (
            <option key={level} value={level}>
              {thinkingLabel(level)}
            </option>
          ))}
        </select>
      </FormField>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {model ? (
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        ) : (
          <SubmitButton pendingText="Adding…">Add model</SubmitButton>
        )}
        <p role="status" className={`text-sm ${state.ok ? "text-ink" : "text-danger"}`}>
          {message}
        </p>
      </div>
    </form>
  );
}
