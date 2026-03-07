import { STEPS } from "../AutopilotPipeline";

export const PipelineSteps = () => (
  <div className="rounded-lg border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
      What happens for each folder
    </p>
    <div className="flex items-center gap-2 flex-wrap">
      {STEPS.map((step, idx) => (
        <div key={step.key} className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {idx + 1}
            </span>
            <span className="text-xs font-medium">{step.label}</span>
          </div>
          {idx < STEPS.length - 1 && (
            <span className="text-muted-foreground">→</span>
          )}
        </div>
      ))}
    </div>
  </div>
);
