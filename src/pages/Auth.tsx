import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import brandAuraIcon from "@/assets/brand-aura-icon-new.png";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { data: isValid, error: rpcError } = await supabase.rpc("validate_beta_code", {
          _code: inviteCode.trim(),
        });
        if (rpcError) throw rpcError;
        if (!isValid) {
          toast.error("Invalid or expired invite code");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your email to confirm your account!");
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-card">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="absolute top-1/4 -left-20 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 h-72 w-72 rounded-full bg-accent/8 blur-3xl" />
        <div className="relative z-10 max-w-md px-12 space-y-8">
          <img src={brandAuraIcon} alt="Brand Aura" className="h-20 w-20 object-contain" />
          <div className="space-y-3">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              Turn designs into listings in minutes
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              AI-powered product listings, mockups, and multi-channel publishing — all from a single design upload.
            </p>
          </div>
          <div className="space-y-4 pt-4">
            {[
              "AI auto-fill from product images",
              "One-click Shopify & marketplace push",
              "Color variant mockup generation",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <span className="text-sm text-foreground/80">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Logo — visible on mobile only */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <img src={brandAuraIcon} alt="Brand Aura" className="h-20 w-20 object-contain" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {isLogin ? "Welcome back" : "Create your account"}
              </h1>
              <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                Beta
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isLogin
                ? "Sign in to continue to Brand Aura"
                : "Start building AI-powered product listings"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11"
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="invite-code">Invite Code</Label>
                <Input
                  id="invite-code"
                  type="text"
                  placeholder="Enter your beta invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Brand Aura is in private beta. You need an invite code to sign up.
                </p>
              </div>
            )}
            <Button type="submit" className="w-full h-11 gap-2 text-sm font-medium" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">
                {isLogin ? "New to Brand Aura?" : "Already have an account?"}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? "Create an account" : "Sign in instead"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By signing up you agree to our{" "}
            <Link to="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
