// Shared helpers for safe error responses from edge functions.
// Avoid leaking raw internal error messages, stack traces, or DB details to clients.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GENERIC_MESSAGE = "An internal error occurred. Please try again.";

/**
 * Build a safe JSON error response. Always logs the original error server-side,
 * and only returns a generic message to the client unless `clientMessage` is provided
 * (used for expected/validation errors that are safe to surface).
 */
export function safeErrorResponse(
  err: unknown,
  opts: { status?: number; clientMessage?: string; context?: string; extraHeaders?: Record<string, string> } = {},
): Response {
  const { status = 500, clientMessage, context, extraHeaders } = opts;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[edge-error]${context ? ` ${context}:` : ""}`, message, err instanceof Error ? err.stack : undefined);
  return new Response(
    JSON.stringify({ error: clientMessage ?? GENERIC_MESSAGE }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...(extraHeaders ?? {}) },
    },
  );
}
