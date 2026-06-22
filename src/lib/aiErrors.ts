import { toast } from "sonner";
import { logCaughtError } from "./errorLogger";

/**
 * Handles AI-related errors from edge functions.
 * Returns true if the error was handled (caller should stop).
 */
export function handleAiError(error: any, data: any, fallbackMessage = "AI request failed"): boolean {
  // Check data.error first (edge function returned JSON error)
  const errorMsg = data?.error || error?.message || "";

  // supabase.functions.invoke stores the HTTP status in error.context
  const httpStatus = error?.context?.status || error?.status;

  // Log every AI error for admin debugging
  logCaughtError(error || new Error(errorMsg), "edge-function", {
    functionResponse: data?.error,
    code: data?.code,
    status: httpStatus,
  });

  if (
    errorMsg.includes("credits") ||
    errorMsg.includes("Insufficient credits") ||
    data?.code === "CREDITS_EXHAUSTED" ||
    httpStatus === 402
  ) {
    toast.error("Not enough credits", {
      description: "This action requires credits. Go to Settings → Credits to purchase more.",
      duration: 10000,
    });
    return true;
  }

  if (
    errorMsg.includes("Rate limit") ||
    errorMsg.includes("429") ||
    httpStatus === 429
  ) {
    toast.error("Too many requests", {
      description: "Please wait a moment and try again.",
      duration: 5000,
    });
    return true;
  }

  // Generic error
  toast.error(errorMsg || fallbackMessage);
  return false;
}
