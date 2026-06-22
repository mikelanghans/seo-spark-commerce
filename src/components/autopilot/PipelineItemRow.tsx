import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { STEPS, PipelineItem } from "../AutopilotPipeline";

interface Props {
  item: PipelineItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

export const PipelineItemRow = ({ item, expanded, onToggle }: Props) => {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {item.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
        {item.status === "error" && <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
        {item.status === "active" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
        {item.status === "pending" && <div className="h-4 w-4 shrink-0 rounded-full border-2 border-border" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {item.productTitle || item.folderName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {item.designFileName}
            {item.mockupFileNames.length > 0 && ` + ${item.mockupFileNames.length} mockup${item.mockupFileNames.length > 1 ? "s" : ""}`}
          </p>
          {item.status === "active" && (
            <p className="text-xs text-muted-foreground">
              {STEPS.find((s) => s.key === item.step)?.label}…
            </p>
          )}
          {item.error && (
            <p className="text-xs text-destructive truncate">{item.error}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {STEPS.map((step) => {
              let status: "done" | "active" | "error" | "pending" = "pending";
              const stepIdx = STEPS.findIndex((s) => s.key === step.key);
              const currentStepIdx = STEPS.findIndex((s) => s.key === item.step);
              if (item.step === "done" || stepIdx < currentStepIdx) status = "done";
              else if (stepIdx === currentStepIdx && item.status === "active") status = "active";
              else if (stepIdx === currentStepIdx && item.status === "error") status = "error";
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${
                    status === "done"
                      ? "bg-green-500/10 text-green-600"
                      : status === "active"
                      ? "bg-primary/10 text-primary"
                      : status === "error"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {status === "done" && <CheckCircle2 className="h-3 w-3" />}
                  {status === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === "error" && <XCircle className="h-3 w-3" />}
                  {step.label}
                </div>
              );
            })}
          </div>
          {item.mockupFileNames.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Color variants:</p>
              <div className="flex flex-wrap gap-1">
                {item.mockupFileNames.map((name) => (
                  <span key={name} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
