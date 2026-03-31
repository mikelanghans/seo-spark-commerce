import { toast } from "sonner";
import { logCaughtError } from "./errorLogger";

/**
 * Handles AI-related errors from edge functions.
 * Returns true if the error was handled (caller should stop).
 */
export function handleAiError(error: any, data: any, fallbackMessage = "AI request failed"): boolean {
  // Check data.error first (edge function returned JSON error)
  const errorMsg = data?.error || error?.message || "";

  // Log every AI error for admin debugging
  logCaughtError(error || new Error(errorMsg), "edge-function", {
    functionResponse: data?.error,
    status: error?.status,
  });

  if (
    errorMsg.includes("credits exhausted") ||
    errorMsg.includes("402") ||
    error?.status === 402
  ) {
    toast.error("AI credits exhausted", {
      description: "Your AI usage credits have run out. Please add more credits in Settings → Workspace → Usage to continue generating.",
      duration: 10000,
    });
    return true;
  }

  if (
    errorMsg.includes("Rate limit") ||
    errorMsg.includes("429") ||
    error?.status === 429
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
