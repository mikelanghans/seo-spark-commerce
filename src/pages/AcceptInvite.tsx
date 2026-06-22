import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "auth-required">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      localStorage.setItem("pending_invite_token", token || "");
      setStatus("auth-required");
      return;
    }
    acceptInvite();
  }, [user, authLoading, token]);

  const acceptInvite = async () => {
    if (!token || !user) return;
    setStatus("loading");

    try {
      const { data, error } = await supabase.rpc("accept_invite", {
        _invite_token: token,
      });

      if (error) throw error;

      const result = data as any;

      if (result?.error) {
        setStatus("error");
        setMessage(result.error);
        return;
      }

      setStatus("success");
      if (result?.status === "already_member") {
        setMessage(`You're already a member of ${result.org_name}.`);
      } else {
        setMessage(`You've joined ${result.org_name} as ${result.role}!`);
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Something went wrong.");
    }
  };

  if (authLoading || status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Accepting invite...</p>
        </div>
      </div>
    );
  }

  if (status === "auth-required") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-6">
          <h1 className="text-xl font-bold">You've been invited!</h1>
          <p className="text-sm text-muted-foreground">
            Sign in or create an account to join the brand.
          </p>
          <Button onClick={() => navigate("/auth")} className="w-full">
            Sign In / Sign Up
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-sm px-6">
        {status === "success" ? (
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
        ) : (
          <XCircle className="h-12 w-12 text-destructive mx-auto" />
        )}
        <h1 className="text-xl font-bold">
          {status === "success" ? "Welcome!" : "Invite Error"}
        </h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button onClick={() => navigate("/")} className="w-full">
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default AcceptInvite;
