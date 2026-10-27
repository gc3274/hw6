// Copied from gc3274/hw1@f2e5c79 lib/gemini.test.ts; keep in sync
import { ApiError } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { classifyError } = await import("./gemini");

const apiError = (status: number, message = "error") => new ApiError({ status, message });

describe("classifyError", () => {
  it.each([
    [apiError(429), "busy"],
    [apiError(503), "busy"],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "busy"],
    [new Error("RESOURCE_EXHAUSTED: quota"), "busy"],
    [apiError(500, "The model is experiencing high demand"), "busy"],
    [apiError(404, "models/gemini-9 is not found"), "not_found"],
    [apiError(400, "Thinking level is not supported for this model"), "bad_request"],
    [apiError(500, "internal"), "failed"],
    [apiError(403, "permission denied"), "failed"],
    ["a thrown string", "failed"],
  ] as const)("%s is %s", (err, kind) => {
    expect(classifyError(err)).toBe(kind);
  });
});
