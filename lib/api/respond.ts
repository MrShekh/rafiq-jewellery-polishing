import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { logger } from "@/lib/logger";
import { AuthError } from "@/lib/auth/session";
import { NotFoundError, ConflictError } from "@/lib/db/repositories/orders";

/**
 * Central error -> HTTP response mapping (brief section 37: "Never expose
 * raw technical errors to the end user... Log the technical error
 * internally.") Every API route's catch block should funnel through this
 * so the renderer only ever sees a short, plain-language message while the
 * full stack trace/details land in the log file.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message || "That record could not be found." }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields and try again.",
        fieldErrors: err.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error("Unhandled API error", { message, stack });

  return NextResponse.json(
    { error: "Something went wrong on this computer. Your data is safe - please try again." },
    { status: 500 },
  );
}

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}
