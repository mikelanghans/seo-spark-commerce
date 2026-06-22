import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ScanErrorDrawer } from "./ScanErrorDrawer";
import { AlertCircle, X } from "lucide-react";

interface State {
  hasError: boolean;
  error: Error | null;
  drawerOpen: boolean;
  dismissed: boolean;
  timestamp: string;
}

export class GlobalErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, error: null, drawerOpen: false, dismissed: false, timestamp: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, dismissed: false, timestamp: new Date().toISOString() };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("SEO module error:", error, info);
  }

  private getScanId(): string | null {
    const m = window.location.pathname.match(/\/seo\/scan\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  private copyDetails = async () => {
    const detail = {
      message: this.state.error?.message,
      route: window.location.pathname,
      scanId: this.getScanId(),
      timestamp: this.state.timestamp,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
    } catch {
      // ignore
    }
  };

  render() {
    const { hasError, error, drawerOpen, dismissed, timestamp } = this.state;
    const scanId = this.getScanId();

    return (
      <>
        {hasError && !dismissed && (
          <div className="sticky top-0 z-50 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground backdrop-blur">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">SEO module error</div>
                <div className="truncate text-xs text-muted-foreground">
                  {error?.message} · {window.location.pathname} {scanId ? `· scan ${scanId.slice(0, 8)}…` : ""} · {new Date(timestamp).toLocaleTimeString()}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={this.copyDetails}>Copy details</Button>
                <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload</Button>
                {scanId && (
                  <Button size="sm" variant="outline" onClick={() => this.setState({ drawerOpen: true })}>
                    View scan error details
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => this.setState({ dismissed: true })} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        <ScanErrorDrawer
          open={drawerOpen}
          onOpenChange={(o) => this.setState({ drawerOpen: o })}
          scanId={scanId}
          errorMessage={error?.message}
          pathname={window.location.pathname}
          timestamp={timestamp}
        />

        {hasError ? (
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold">Something went wrong in the SEO module.</h2>
              <p className="text-sm text-muted-foreground">Use the banner above to copy details or reload.</p>
            </div>
          </div>
        ) : (
          this.props.children
        )}
      </>
    );
  }
}
