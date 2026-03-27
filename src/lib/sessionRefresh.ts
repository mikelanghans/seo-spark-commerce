import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures we have a valid session before making edge function calls.
 * Returns true if session is valid, false if user needs to re-login.
 */
export async function ensureValidSession(): Promise<boolean> {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    // Try refreshing
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      return false;
    }
  }
  
  return true;
}
