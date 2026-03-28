import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { Building2, Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import type { Organization, View } from "@/types/dashboard";

interface Props {
  userId: string;
  orgs: Organization[];
  loading: boolean;
  archivedOrgs: Organization[];
  showArchived: boolean;
  onToggleArchived: () => void;
  onSelectOrg: (org: Organization) => void;
  onEditOrg: (org: Organization) => void;
  onDeleteOrg: (org: Organization) => void;
  onRestoreOrg: (id: string) => void;
  setView: (v: View) => void;
  selectedOrg: Organization | null;
}

export const OrgListView = ({
  userId, orgs, loading, archivedOrgs, showArchived,
  onToggleArchived, onSelectOrg, onEditOrg, onDeleteOrg, onRestoreOrg,
  setView, selectedOrg,
}: Props) => (
  <div className="space-y-6">
    <OnboardingChecklist
      userId={userId}
      onNavigate={(target) => {
        if (target === "org-form") setView("org-form");
        else if (target === "product-form") {
          if (selectedOrg) setView("product-form");
        }
        else if (target === "settings") {
          if (selectedOrg) setView("settings");
        }
      }}
    />
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">Your Brands</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">Each brand has its own products, tone, and audience context for AI-generated content</p>
      </div>
      <Button onClick={() => setView("org-form")} className="gap-2 self-start sm:self-auto">
        <Plus className="h-4 w-4" /> New Brand
      </Button>
    </div>

    {loading ? (
      <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    ) : orgs.length === 0 ? (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
        <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No brands yet — create one to get started</p>
        <Button variant="link" onClick={() => setView("org-form")} className="mt-2">Create your first brand</Button>
      </div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2">
        {orgs.map((org) => (
          <div key={org.id} className="group relative cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5" onClick={() => onSelectOrg(org)}>
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={(e) => { e.stopPropagation(); onEditOrg(org); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Edit2 className="h-4 w-4" /></button>
              <button onClick={(e) => { e.stopPropagation(); onDeleteOrg(org); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-4">
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="h-20 w-20 rounded-xl object-cover border border-border shrink-0" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-2xl shrink-0">{org.name.charAt(0).toUpperCase()}</div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg leading-tight">{org.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{org.niche}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{org.tone}</span><span>•</span><span className="truncate">{org.audience}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

    <div className="mt-8">
      <button onClick={onToggleArchived} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        {showArchived ? "Hide" : "Show"} archived brands
      </button>
      {showArchived && archivedOrgs.length > 0 && (
        <div className="mt-3 space-y-2">
          {archivedOrgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3">
              <div>
                <span className="font-medium text-muted-foreground">{org.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">Archived {org.deleted_at ? new Date(org.deleted_at).toLocaleDateString() : ""}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => onRestoreOrg(org.id)}>Restore</Button>
            </div>
          ))}
        </div>
      )}
      {showArchived && archivedOrgs.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No archived brands</p>}
    </div>
  </div>
);
