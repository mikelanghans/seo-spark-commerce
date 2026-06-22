import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const AUTH_BOOT_TIMEOUT_MS = 8000;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const finishLoading = (nextUser: User | null) => {
      if (!isMounted) return;
      setUser(nextUser);
      setLoading(false);
    };

    const timeoutId = window.setTimeout(() => {
      finishLoading(null);
    }, AUTH_BOOT_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.clearTimeout(timeoutId);
      finishLoading(session?.user ?? null);
    });

    void supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        window.clearTimeout(timeoutId);
        finishLoading(session?.user ?? null);
      })
      .catch(() => {
        window.clearTimeout(timeoutId);
        finishLoading(null);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, loading, signOut };
}
