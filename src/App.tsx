import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Component, lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const queryClient = new QueryClient();
const MODULE_RETRY_STORAGE_KEY = "lovable:route-module-retry-at";
const MODULE_RETRY_WINDOW_MS = 10000;

const lazyRetry = <T extends { default: React.ComponentType<any> }>(
  importer: () => Promise<T>,
  retriesLeft = 2,
  interval = 500,
): Promise<T> =>
  new Promise((resolve, reject) => {
    importer()
      .then(resolve)
      .catch((error) => {
        if (retriesLeft <= 0) {
          reject(error);
          return;
        }

        window.setTimeout(() => {
          lazyRetry(importer, retriesLeft - 1, interval).then(resolve).catch(reject);
        }, interval);
      });
  });

const createLazyRoute = (importer: () => Promise<{ default: React.ComponentType<any> }>) => {
  let pendingImport: Promise<{ default: React.ComponentType<any> }> | null = null;

  const load = () => {
    if (!pendingImport) {
      pendingImport = lazyRetry(importer).catch((error) => {
        pendingImport = null;
        throw error;
      });
    }

    return pendingImport;
  };

  return {
    Component: lazy(load),
    preload: load,
  };
};

const authRoute = createLazyRoute(() => import("./pages/Auth"));
const dashboardRoute = createLazyRoute(() => import("./pages/Dashboard"));
const acceptInviteRoute = createLazyRoute(() => import("./pages/AcceptInvite"));
const featuresRoute = createLazyRoute(() => import("./pages/Features"));
const adminRoute = createLazyRoute(() => import("./pages/Admin"));
const notFoundRoute = createLazyRoute(() => import("./pages/NotFound"));
const termsRoute = createLazyRoute(() => import("./pages/Terms"));
const ebayOAuthCallbackRoute = createLazyRoute(() => import("./pages/EbayOAuthCallback"));

const Auth = authRoute.Component;
const Dashboard = dashboardRoute.Component;
const AcceptInvite = acceptInviteRoute.Component;
const Features = featuresRoute.Component;
const Admin = adminRoute.Component;
const NotFound = notFoundRoute.Component;
const Terms = termsRoute.Component;
const EbayOAuthCallback = ebayOAuthCallbackRoute.Component;

const AppShellLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

class RouteErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Route load failed:", error);

    const message = error instanceof Error ? error.message : String(error);
    const isModuleLoadError = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);

    if (isModuleLoadError) {
      const lastRetryAt = Number(window.sessionStorage.getItem(MODULE_RETRY_STORAGE_KEY) || "0");

      if (Date.now() - lastRetryAt > MODULE_RETRY_WINDOW_MS) {
        window.sessionStorage.setItem(MODULE_RETRY_STORAGE_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Preview failed to load</h1>
            <p className="max-w-md text-sm text-muted-foreground">
              A temporary preview module failed to load. Retry to restore the app.
            </p>
          </div>
          <Button onClick={this.handleRetry}>Retry preview</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

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

const App = () => {
  useEffect(() => {
    void authRoute.preload();
    void dashboardRoute.preload();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <FeedbackWidget />
        <BrowserRouter>
          <RouteErrorBoundary>
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
          </RouteErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
