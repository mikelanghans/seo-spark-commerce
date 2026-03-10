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
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Store invite token and redirect to auth
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
      // Look up the invite
      const { data: invite, error: inviteError } = await supabase
        .from("organization_invites")
        .select("*")
        .eq("invite_token", token)
        .is("accepted_at", null)
        .single();

      if (inviteError || !invite) {
        setStatus("error");
        setMessage("This invite link is invalid or has already been used.");
        return;
      }

      // Get org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", invite.organization_id)
        .single();

      setOrgName(org?.name || "the brand");

      // Check if already a member
      const { data: existing } = await supabase
        .from("organization_members")
        .select("id")
        .eq("organization_id", invite.organization_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setStatus("success");
        setMessage(`You're already a member of ${org?.name || "this brand"}.`);
        return;
      }

      // Add as member
      const { error: memberError } = await supabase
        .from("organization_members")
        .insert({
          organization_id: invite.organization_id,
          user_id: user.id,
          role: invite.role as any,
        });

      if (memberError) throw memberError;

      // Mark invite as accepted
      await supabase
        .from("organization_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      setStatus("success");
      setMessage(`You've joined ${org?.name || "the brand"} as ${invite.role}!`);
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
