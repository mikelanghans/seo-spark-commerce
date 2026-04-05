import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const queryClient = new QueryClient();
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Features = lazy(() => import("./pages/Features"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Terms = lazy(() => import("./pages/Terms"));
const EbayOAuthCallback = lazy(() => import("./pages/EbayOAuthCallback"));

const AppShellLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (!loading && !user) {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const shop = params.get("shop");
    if (code && shop) {
      localStorage.setItem("shopify_oauth_code", code);
      localStorage.setItem("shopify_oauth_shop", shop);
    }
    if (!code && shop) {
      localStorage.setItem("shopify_pending_shop", shop);
    }
    return <Navigate to="/auth" replace />;
  }
  
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (user) {
    // Check for pending invite
    const pendingToken = localStorage.getItem("pending_invite_token");
    if (pendingToken) {
      localStorage.removeItem("pending_invite_token");
      return <Navigate to={`/invite/${pendingToken}`} replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <FeedbackWidget />
      <BrowserRouter>
        <Suspense fallback={<AppShellLoader />}>
          <Routes>
            <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
            <Route path="/oauth/ebay/callback" element={<EbayOAuthCallback />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route path="/features" element={<Features />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
