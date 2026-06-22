import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown, ChevronUp, Play, Sparkles, X } from "lucide-react";
import { useGuidedTour } from "./GuidedTourContext";

const LS_DISMISSED = "brand_aura_guided_tour_widget_dismissed";

export function GuidedTourWidget() {
  const { steps, active, stepIndex, completedSteps, start, stop, goTo } = useGuidedTour();
  const [collapsed, setCollapsed] = useState(true);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_DISMISSED) === "1");

  if (dismissed) return null;

  const completedCount = completedSteps.size;
  const total = steps.length;
  const allDone = completedCount === total;
  const pct = total > 0 ? (completedCount / total) * 100 : 0;

  const handleDismiss = () => {
    localStorage.setItem(LS_DISMISSED, "1");
    setDismissed(true);
    if (active) stop();
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {allDone ? "You're all set!" : "Get Started"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {completedCount} of {total} complete
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleDismiss}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="px-4 py-2">
        <Progress value={pct} className="h-1.5" />
      </div>

      {!collapsed && (
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-border">
          {steps.map((step, i) => {
            const done = completedSteps.has(step.id);
            const isCurrent = active && i === stepIndex;
            return (
              <button
                key={step.id}
                onClick={() => goTo(step.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  isCurrent ? "bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : isCurrent
                      ? "border-primary"
                      : "border-muted-foreground/30"
                  }`}
                >
                  {done && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-medium leading-tight ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {step.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{step.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!active && !allDone && (
        <div className="border-t border-border px-4 py-2.5">
          <Button size="sm" className="w-full gap-1.5 h-8 text-xs" onClick={start}>
            <Play className="h-3 w-3" /> Start guided tour
          </Button>
        </div>
      )}
    </div>
  );
}
