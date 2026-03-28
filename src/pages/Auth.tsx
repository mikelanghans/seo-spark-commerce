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
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Ambient glow effects */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-[hsl(var(--primary)/0.08)] blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[hsl(var(--accent)/0.06)] blur-[120px]" />

      <div className="relative w-full max-w-md space-y-8">
        {/* Logo & branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[hsl(var(--primary)/0.2)] blur-xl scale-150" />
            <img src={brandAuraIcon} alt="Brand Aura" className="relative h-20 w-20 object-contain drop-shadow-lg" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight text-foreground" style={{ fontFamily: "var(--font-heading)" }}>
              Brand Aura
            </h1>
            <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
              Beta
            </span>
          </div>
          <p className="text-xs text-muted-foreground tracking-[0.2em] uppercase">
            AI-Powered Brand Studio
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-xl p-8 shadow-2xl shadow-primary/5">
          <div className="mb-6 text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {isLogin ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? "Sign in to continue building your brand" : "Start creating AI-powered listings"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="h-11 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="invite-code" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Invite Code
                </Label>
                <Input
                  id="invite-code"
                  type="text"
                  placeholder="Enter your beta invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  className="h-11 bg-background/50 border-border/60 focus:border-primary/50 transition-colors"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Private beta — invite code required to sign up
                </p>
              </div>
            )}
            <Button
              type="submit"
              className="w-full h-11 gap-2 text-sm font-semibold mt-2"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {isLogin ? "Sign In" : "Sign Up"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/60">
          By signing up you agree to our{" "}
          <Link to="/terms" className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;
