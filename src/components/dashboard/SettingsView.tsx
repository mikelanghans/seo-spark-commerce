import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { CreditPackPurchase } from "@/components/CreditPackPurchase";
import { CreditCostBreakdown } from "@/components/CreditCostBreakdown";
import { SupportForm } from "@/components/SupportForm";
import type { Organization } from "@/types/dashboard";
import type { View } from "@/types/dashboard";

interface Props {
  userId: string;
  userEmail: string;
  selectedOrg: Organization | null;
  effectiveTier: "free" | "pro" | "starter";
  isFf: boolean;
  onRefresh: () => Promise<void>;
  setView: (v: View) => void;
}

export const SettingsView = ({ userId, userEmail, selectedOrg, effectiveTier, isFf, onRefresh, setView }: Props) => (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => selectedOrg ? setView("products") : setView("orgs")}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <div>
        <h2 className="text-2xl font-bold">Account</h2>
        <p className="text-sm text-muted-foreground">Subscription, credits & support — brand-specific settings are in each brand's <strong>Settings</strong> tab</p>
      </div>
    </div>
    <div className="rounded-xl border border-border bg-card p-6">
      <SubscriptionPlans currentTier={effectiveTier} isFf={isFf} onRefresh={onRefresh} />
    </div>
    <div className="rounded-xl border border-border bg-card p-6">
      <CreditPackPurchase />
    </div>
    <div className="rounded-xl border border-border bg-card p-6">
      <CreditCostBreakdown />
    </div>
    <div className="rounded-xl border border-border bg-card p-6">
      <SupportForm userId={userId} userEmail={userEmail} tier={effectiveTier} organizationId={selectedOrg?.id} />
    </div>
  </div>
);
