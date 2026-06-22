import { supabase } from "@/integrations/supabase/client";

const LOW_CREDIT_NOTIFICATION_MILESTONES = [10, 5, 3, 1] as const;

interface CreateNotificationParams {
  userId: string;
  organizationId?: string | null;
  type: "sync_failure" | "low_credits" | "team_invite" | "info" | "warning";
  title: string;
  message: string;
  actionUrl?: string;
}

export async function createNotification({
  userId, organizationId, type, title, message, actionUrl,
}: CreateNotificationParams) {
  return supabase.from("notifications").insert({
    user_id: userId,
    organization_id: organizationId ?? null,
    type,
    title,
    message,
    action_url: actionUrl ?? null,
  });
}

export async function notifySyncFailure(userId: string, orgId: string, marketplace: string, error: string) {
  return createNotification({
    userId,
    organizationId: orgId,
    type: "sync_failure",
    title: `${marketplace} sync failed`,
    message: error || `Failed to sync with ${marketplace}. Please check your connection settings.`,
  });
}

export async function notifyLowCredits(userId: string, remaining: number) {
  if (!LOW_CREDIT_NOTIFICATION_MILESTONES.includes(remaining as typeof LOW_CREDIT_NOTIFICATION_MILESTONES[number])) {
    return { data: null, error: null };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const message = `You have ${remaining} AI credits remaining. Consider upgrading or purchasing a credit pack.`;

  const { data: existingNotification, error: existingNotificationError } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "low_credits")
    .eq("title", "AI credits running low")
    .eq("message", message)
    .gte("created_at", startOfMonth.toISOString())
    .limit(1)
    .maybeSingle();

  if (existingNotificationError) {
    return { data: null, error: existingNotificationError };
  }

  if (existingNotification) {
    return { data: null, error: null };
  }

  return createNotification({
    userId,
    type: "low_credits",
    title: "AI credits running low",
    message,
  });
}

export async function notifyTeamInvite(userId: string, orgId: string, orgName: string, inviterEmail?: string) {
  return createNotification({
    userId,
    organizationId: orgId,
    type: "team_invite",
    title: `You've been invited to ${orgName}`,
    message: inviterEmail
      ? `${inviterEmail} invited you to collaborate on ${orgName}.`
      : `You've been invited to collaborate on ${orgName}.`,
    actionUrl: "/accept-invite",
  });
}
