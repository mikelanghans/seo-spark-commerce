import { supabase } from "@/integrations/supabase/client";

let isLogging = false;

interface ErrorLogPayload {
  error_message: string;
  error_stack?: string;
  error_source: string;
  page_url?: string;
  metadata?: Record<string, any>;
}

async function logError(payload: ErrorLogPayload) {
  if (isLogging) return; // prevent recursive loops
  isLogging = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await (supabase as any).from("error_logs").insert({
      user_id: user.id,
      error_message: (payload.error_message || "").slice(0, 2000),
      error_stack: (payload.error_stack || "").slice(0, 5000),
      error_source: payload.error_source,
      page_url: payload.page_url || window.location.href,
      user_agent: navigator.userAgent,
      metadata: payload.metadata || {},
    });
  } catch {
    // silently fail — we don't want error logging to cause more errors
  } finally {
    isLogging = false;
  }
}

/** Log a caught error from try/catch blocks or edge function failures */
export function logCaughtError(
  error: any,
  source: string,
  metadata?: Record<string, any>
) {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logError({
    error_message: msg,
    error_stack: stack,
    error_source: source,
    metadata,
  });
}

/** Install global handlers for uncaught errors and unhandled rejections */
export function installGlobalErrorHandlers() {
  window.addEventListener("error", (event) => {
    logError({
      error_message: event.message || "Uncaught error",
      error_stack: event.error?.stack,
      error_source: "uncaught",
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logError({
      error_message: msg,
      error_stack: stack,
      error_source: "unhandled-rejection",
    });
  });
}
