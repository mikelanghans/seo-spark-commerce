import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, X, Zap, Sparkles } from "lucide-react";
import { useGuidedTour } from "./GuidedTourContext";

interface Rect { top: number; left: number; width: number; height: number }

const PADDING = 8;

export function GuidedTourSpotlight() {
  const { active, currentStep, stepIndex, steps, next, prev, stop, completion } = useGuidedTour();
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);

  // Locate target on every step change + on resize/scroll
  useLayoutEffect(() => {
    if (!active || !currentStep) { setRect(null); setMissing(false); return; }
    if (!currentStep.target) { setRect(null); setMissing(false); return; }

    let raf = 0;
    let attempts = 0;

    const measure = () => {
      const el = document.querySelector(currentStep.target!) as HTMLElement | null;
      if (!el) {
        attempts += 1;
        if (attempts < 30) {
          raf = window.requestAnimationFrame(measure);
        } else {
          setMissing(true);
          setRect(null);
        }
        return;
      }
      setMissing(false);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      // Bring into view
      if (r.top < 0 || r.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    measure();
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const interval = window.setInterval(measure, 500);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(interval);
    };
  }, [active, currentStep]);

  if (!active || !currentStep) return null;

  const isLast = stepIndex === steps.length - 1;
  const isAutoCompleted = currentStep.autoComplete ? completion[currentStep.autoComplete] : false;

  // Tooltip position
  const tooltipStyle: React.CSSProperties = (() => {
    if (!rect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: 380,
        width: "calc(100vw - 32px)",
      };
    }
    const placeBelow = rect.top + rect.height + 12 + 220 < window.innerHeight;
    const top = placeBelow ? rect.top + rect.height + 12 : rect.top - 12 - 220;
    const left = Math.max(12, Math.min(window.innerWidth - 392, rect.left));
    return { position: "fixed", top, left, maxWidth: 380, width: "calc(100vw - 32px)" };
  })();

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {/* Backdrop with cutout */}
      {rect ? (
        <svg className="pointer-events-auto absolute inset-0 h-full w-full" onClick={(e) => e.stopPropagation()}>
          <defs>
            <mask id="ga-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.left - PADDING}
                y={rect.top - PADDING}
                width={rect.width + PADDING * 2}
                height={rect.height + PADDING * 2}
                rx={10}
                ry={10}
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#ga-mask)" />
          {/* Glow ring */}
          <rect
            x={rect.left - PADDING}
            y={rect.top - PADDING}
            width={rect.width + PADDING * 2}
            height={rect.height + PADDING * 2}
            rx={10}
            ry={10}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            className="animate-pulse"
          />
        </svg>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/55" onClick={(e) => e.stopPropagation()} />
      )}

      {/* Tooltip card */}
      <div
        className="pointer-events-auto rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        style={tooltipStyle}
      >
        <div className="h-1 w-full bg-gradient-to-r from-primary via-[hsl(var(--aura-cyan,_var(--primary)))] to-[hsl(var(--aura-magenta,_var(--primary)))]" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">
                  Step {stepIndex + 1} of {steps.length}
                </p>
                <h4 className="text-sm font-bold text-foreground leading-tight">{currentStep.title}</h4>
              </div>
            </div>
            <button
              onClick={stop}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs leading-relaxed text-secondary-foreground">{currentStep.description}</p>

          {missing && (
            <p className="text-[11px] text-muted-foreground italic">
              The button for this step isn't visible right now. Click Next to continue.
            </p>
          )}

          {currentStep.tip && (
            <div className="flex items-start gap-2 rounded-md bg-primary/10 border border-primary/20 px-2.5 py-2">
              <Zap className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-[11px] text-foreground/80">{currentStep.tip}</p>
            </div>
          )}

          {isAutoCompleted && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Done — moving on…</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={prev} disabled={stepIndex === 0} className="gap-1 h-7 text-xs">
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <button onClick={stop} className="text-[11px] text-muted-foreground hover:text-foreground">
                Skip tour
              </button>
              <Button size="sm" onClick={isLast ? stop : next} className="gap-1 h-7 text-xs">
                {isLast ? "Finish" : <>Next <ArrowRight className="h-3 w-3" /></>}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
