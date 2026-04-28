import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AiUsageMeter } from "@/components/AiUsageMeter";
import { NotificationBell } from "@/components/NotificationBell";
import { OnboardingTrigger } from "@/components/OnboardingTour";
import { Sun, Moon, Settings, BookOpen, Shield, LogOut, Gauge } from "lucide-react";
import brandAuraIcon from "@/assets/brand-aura-icon-new.png";
import type { Organization } from "@/types/dashboard";

interface Props {
  selectedOrg: Organization | null;
  aiUsage: { usedCount: number; limit: number; loading: boolean };
  notifications: { notifications: any[]; unreadCount: number; markAsRead: (id: string) => void; markAllRead: () => void; dismiss: (id: string) => void };
  theme: string;
  toggleTheme: () => void;
  isAdmin: boolean;
  onSettings: () => void;
  onShowTour: () => void;
  signOut: () => void;
}

export const DashboardHeader = ({ selectedOrg, aiUsage, notifications, theme, toggleTheme, isAdmin, onSettings, onShowTour, signOut }: Props) => {
  const navigate = useNavigate();

  return (
    <header className="border-b border-border/50 px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={brandAuraIcon} alt="Brand Aura" className="h-8 w-8 sm:h-10 sm:w-10 object-contain" />
          <span className="text-lg sm:text-xl font-bold tracking-tight text-foreground hidden xs:inline">Brand Aura</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {selectedOrg && (
            <div className="hidden sm:block">
              <AiUsageMeter used={aiUsage.usedCount} limit={aiUsage.limit} loading={aiUsage.loading} />
            </div>
          )}
          <NotificationBell
            notifications={notifications.notifications}
            unreadCount={notifications.unreadCount}
            onMarkRead={notifications.markAsRead}
            onMarkAllRead={notifications.markAllRead}
            onDismiss={notifications.dismiss}
          />
          <OnboardingTrigger onClick={onShowTour} />
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onSettings} title="Account & Subscription">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate("/seo")} title="SEO Site Audit">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate("/features")} title="Feature Guide">
            <BookOpen className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate("/admin")} title="Admin Console">
              <Shield className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={signOut} className="gap-2 h-8 sm:h-9 px-2 sm:px-3">
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </header>
  );
};
