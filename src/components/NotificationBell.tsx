import { useState } from "react";
import { Bell, X, Check, CheckCheck, AlertTriangle, CreditCard, Users, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Notification } from "@/hooks/useNotifications";

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  sync_failure: { icon: AlertTriangle, color: "text-destructive" },
  low_credits: { icon: CreditCard, color: "text-amber-400" },
  team_invite: { icon: Users, color: "text-accent" },
  warning: { icon: AlertTriangle, color: "text-amber-400" },
  info: { icon: Info, color: "text-primary" },
};

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAllRead, onDismiss }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={onMarkAllRead}>
              <CheckCheck className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => {
              const cfg = typeConfig[n.type] ?? typeConfig.info;
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "group flex gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-secondary/50",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cfg.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm leading-tight", !n.is_read ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {!n.is_read && (
                        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px]" onClick={() => onMarkRead(n.id)}>
                          <Check className="h-3 w-3" /> Read
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[10px] text-destructive" onClick={() => onDismiss(n.id)}>
                        <X className="h-3 w-3" /> Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
