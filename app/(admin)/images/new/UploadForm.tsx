"use client";

import Image from "next/image";
import { unstable_rethrow } from "next/navigation";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import FormField, { describedBy } from "@/components/FormField";
import Spinner from "@/components/Spinner";
import { button, input } from "@/components/ui";
import { CONTEXT_MAX, IMAGE_BUCKET } from "@/lib/captions";
import { codePoints } from "@/lib/format";
import { NOTE_RULE, readNote } from "@/lib/images";
import { isImageFile, PhotoError, resizeToJpeg } from "@/lib/resize-image";
import { parseTopic, TOPICS, type Topic } from "@/lib/roasts";
import { createClient } from "@/lib/supabase/client";
import { createImage, prepareImageUpload, type UploadTicket } from "../actions";

type Stage = "resizing" | "uploading" | "saving";
type Field = "photo" | "topic" | "context";

const STAGE_COPY: Record<Stage, string> = {
  resizing: "Resizing…",
  uploading: "Uploading…",
  saving: "Saving…",
};

const UNREADABLE = "Couldn’t read that photo. Try a JPG, PNG or HEIC.";
const START_FAILED = "Couldn’t start the upload. Try again.";
const UPLOAD_FAILED = "The upload failed. Check your connection and try again.";
const SAVE_FAILED = "Couldn’t save the photo. Try again.";

// The same object when there's nothing to clear, so typing doesn't re-render for nothing
const without = (errors: Partial<Record<Field, string>>, field: Field) => {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
};

// Resizes in the browser, uploads straight to Storage with a signed URL from
// prepareImageUpload, then createImage checks the file and saves the row. The
// photo never goes through a server action, so its size limits don't apply.
export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [topic, setTopic] = useState<Topic>(TOPICS[0].slug);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Optimistic so each stage shows right away and clears itself when the submit ends
  const [stage, setStage] = useOptimistic<Stage | null>(null);
  // Bumped by a refused submit only, so clearing an error while typing never moves focus
  const [refusals, setRefusals] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Free the old blob URL whenever the preview changes or the form goes away
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (refusals === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [refusals]);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    setPreviewFailed(false);
    if (picked && !isImageFile(picked)) {
      event.target.value = "";
      setFile(null);
      setPreview(null);
      setErrors((prev) => ({ ...prev, photo: UNREADABLE }));
      return;
    }
    setErrors((prev) => without(prev, "photo"));
    setFile(picked);
    setPreview(picked ? URL.createObjectURL(picked) : null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found: Partial<Record<Field, string>> = {};
    if (!file) found.photo = "Choose a photo.";
    if (!readNote(note).ok) found.context = NOTE_RULE;
    setError(null);
    setErrors(found);
    if (!file || Object.keys(found).length > 0) {
      setRefusals((n) => n + 1);
      return;
    }

    const picked = file;
    const chosen = topic;
    const context = note;

    startTransition(async () => {
      // State set after an await isn't part of the transition, so it's wrapped again
      const fail = (message: string) => startTransition(() => setError(message));

      setStage("resizing");
      let blob: Blob;
      try {
        blob = await resizeToJpeg(picked);
      } catch (err) {
        fail(err instanceof PhotoError ? err.message : UNREADABLE);
        return;
      }

      startTransition(() => setStage("uploading"));
      let ticket: UploadTicket;
      try {
        ticket = await prepareImageUpload();
      } catch (err) {
        // A lapsed session redirects to sign-in; let Next handle it
        unstable_rethrow(err);
        fail(START_FAILED);
        return;
      }
      if (!ticket.ok) {
        fail(ticket.error);
        return;
      }
      try {
        const { error: uploadError } = await createClient()
          .storage.from(IMAGE_BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.token, blob, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
          });
        if (uploadError) {
          fail(UPLOAD_FAILED);
          return;
        }
      } catch {
        fail(UPLOAD_FAILED);
        return;
      }

      // On success the action redirects to the new photo's page. If it fails it
      // removes the upload itself, so there's nothing to clean up here.
      startTransition(() => setStage("saving"));
      try {
        const result = await createImage(ticket.path, chosen, context);
        fail(result?.error ?? SAVE_FAILED);
      } catch (err) {
        // The success redirect arrives as a thrown navigation; let Next handle it
        unstable_rethrow(err);
        fail(SAVE_FAILED);
      }
    });
  }

  const status = error ?? (stage ? STAGE_COPY[stage] : null);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
      <fieldset disabled={pending} className="space-y-5">
        <FormField
          id="photo"
          label="Photo"
          hint="JPG, PNG or HEIC. It’s resized in your browser and saved as a JPEG under 5 MB."
          error={errors.photo}
        >
          <input
            id="photo"
            name="photo"
            type="file"
            accept="image/*,.heic,.heif"
            required
            onChange={onPick}
            aria-invalid={errors.photo ? true : undefined}
            aria-describedby={describedBy("photo", { hint: true, error: errors.photo })}
            className={`${input} cursor-pointer file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-sm file:font-medium file:text-ink`}
          />
        </FormField>

        {preview && (
          <div className="w-full max-w-xs">
            {previewFailed ? (
              <p className="rounded-lg border border-dashed border-line bg-canvas px-4 py-6 text-sm text-muted">
                This browser can’t preview the photo. It’s converted to JPEG when you upload.
              </p>
            ) : (
              <Image
                src={preview}
                alt="Preview of the photo you picked"
                width={320}
                height={320}
                unoptimized
                onError={() => setPreviewFailed(true)}
                className="aspect-square w-full rounded-xl border border-line bg-canvas object-contain"
              />
            )}
          </div>
        )}

        <FormField
          id="topic"
          label="Topic"
          hint="Picks the critic panel. It can change later only while the photo has no roasts."
          error={errors.topic}
        >
          <select
            id="topic"
            name="topic"
            required
            value={topic}
            onChange={(event) => setTopic(parseTopic(event.target.value) ?? topic)}
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

        <FormField
          id="context"
          label="Note for the critics"
          hint="Optional. Private: it goes into the prompt and is never shown in the app."
          count={`${codePoints(note)}/${CONTEXT_MAX}`}
          error={errors.context}
        >
          <textarea
            id="context"
            name="context"
            rows={2}
            placeholder="Ex: My first carbonara, be gentle"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setErrors((prev) => without(prev, "context"));
            }}
            aria-invalid={errors.context ? true : undefined}
            aria-describedby={describedBy("context", { hint: true, count: true, error: errors.context })}
            className={`${input} resize-y`}
          />
        </FormField>
      </fieldset>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={button("primary")}>
          {pending && <Spinner />}
          {pending ? "Working…" : "Upload photo"}
        </button>
        <p role="status" className={`min-h-5 text-sm ${error ? "text-danger" : "text-ink"}`}>
          {status}
        </p>
      </div>
    </form>
  );
}
