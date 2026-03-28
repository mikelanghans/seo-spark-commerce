import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Organization } from "@/types/dashboard";

interface Props {
  org: Organization;
  confirmText: string;
  onConfirmTextChange: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteOrgDialog = ({ org, confirmText, onConfirmTextChange, onConfirm, onCancel }: Props) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
    <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
      <h3 className="text-lg font-semibold">Archive Brand</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This will archive <strong>{org.name}</strong>. You can restore it within 30 days.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Type <strong>{org.name}</strong> to confirm:
      </p>
      <Input
        className="mt-2"
        placeholder="Type brand name..."
        value={confirmText}
        onChange={(e) => onConfirmTextChange(e.target.value)}
        autoFocus
      />
      <div className="mt-4 flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" size="sm" disabled={confirmText !== org.name} onClick={onConfirm}>
          Archive Brand
        </Button>
      </div>
    </div>
  </div>
);
