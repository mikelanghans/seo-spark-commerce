import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw } from "lucide-react";

export interface UpdateField {
  key: string;
  label: string;
}

interface Props {
  fields: UpdateField[];
  selectedFields: string[];
  onToggleField: (key: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onUpdate: () => void;
  updating: boolean;
  platformName: string;
}

export const UpdateFieldSelector = ({
  fields,
  selectedFields,
  onToggleField,
  onSelectAll,
  onDeselectAll,
  onUpdate,
  updating,
  platformName,
}: Props) => {
  const allSelected = selectedFields.length === fields.length;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">Update existing product</Label>
        <button
          type="button"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="text-xs text-primary hover:underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose which data to sync to your existing {platformName} listing.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <label
            key={field.key}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors"
          >
            <Checkbox
              checked={selectedFields.includes(field.key)}
              onCheckedChange={() => onToggleField(field.key)}
            />
            <span className="text-sm">{field.label}</span>
          </label>
        ))}
      </div>
      <Button
        onClick={onUpdate}
        disabled={updating || selectedFields.length === 0}
        variant="outline"
        className="w-full gap-2"
      >
        {updating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating on {platformName}...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Update on {platformName}
          </>
        )}
      </Button>
    </div>
  );
};
