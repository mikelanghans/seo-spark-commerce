import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, Copy, Mail, Loader2, Trash2, Crown, Pencil, Eye, Link } from "lucide-react";
import { toast } from "sonner";

interface Props {
  organizationId: string;
  organizationName: string;
  userId: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

interface Invite {
  id: string;
  invited_email: string | null;
  invite_token: string;
  role: string;
  accepted_at: string | null;
  created_at: string;
}

export const TeamManager = ({ organizationId, organizationName, userId }: Props) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [sending, setSending] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  useEffect(() => {
    loadTeam();
  }, [organizationId]);

  const loadTeam = async () => {
    setLoading(true);
    const [{ data: membersData }, { data: invitesData }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at"),
      supabase
        .from("organization_invites")
        .select("*")
        .eq("organization_id", organizationId)
        .is("accepted_at", null)
        .order("created_at", { ascending: false }),
    ]);

    const membersList = (membersData || []) as Member[];
    setMembers(membersList);
    setInvites((invitesData || []) as Invite[]);

    const me = membersList.find((m) => m.user_id === userId);
    setCurrentUserRole(me?.role || null);
    setLoading(false);
  };

  const canManage = currentUserRole === "owner" || currentUserRole === "editor";
  const isOwner = currentUserRole === "owner";

  const handleEmailInvite = async () => {
    if (!inviteEmail.trim()) return;
    setSending(true);
    try {
      const { error } = await supabase.from("organization_invites").insert({
        organization_id: organizationId,
        invited_email: inviteEmail.trim().toLowerCase(),
        role: inviteRole as any,
        invited_by: userId,
      });
      if (error) throw error;
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      await loadTeam();
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite");
    } finally {
      setSending(false);
    }
  };

  const handleGenerateLink = async () => {
    setGeneratingLink(true);
    try {
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({
          organization_id: organizationId,
          role: inviteRole as any,
          invited_by: userId,
        })
        .select("invite_token")
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/invite/${data.invite_token}`;
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied to clipboard!");
      await loadTeam();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copied!");
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === userId) {
      toast.error("You can't remove yourself");
      return;
    }
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);
    if (error) {
      toast.error("Failed to remove member");
    } else {
      toast.success("Member removed");
      await loadTeam();
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase
      .from("organization_invites")
      .delete()
      .eq("id", inviteId);
    if (error) {
      toast.error("Failed to revoke invite");
    } else {
      toast.success("Invite revoked");
      await loadTeam();
    }
  };

  const roleIcon = (role: string) => {
    if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (role === "editor") return <Pencil className="h-3.5 w-3.5 text-primary" />;
    return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Team — {organizationName}
        </h3>
        <p className="text-sm text-muted-foreground">
          Invite others to collaborate on this brand
        </p>
      </div>

      {/* Current members */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Members ({members.length})
        </p>
        <div className="space-y-1">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                {roleIcon(m.role)}
                <span className="text-sm font-medium">
                  {m.user_id === userId ? "You" : m.user_id.slice(0, 8) + "..."}
                </span>
                <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                  {m.role}
                </span>
              </div>
              {isOwner && m.user_id !== userId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => handleRemoveMember(m.id, m.user_id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Pending Invites
          </p>
          <div className="space-y-1">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border border-dashed border-border bg-card p-3"
              >
                <div className="flex items-center gap-2">
                  {inv.invited_email ? (
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Link className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className="text-sm">
                    {inv.invited_email || "Share link"}
                  </span>
                  <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                    {inv.role}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleCopyLink(inv.invite_token)}
                    title="Copy invite link"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleRevokeInvite(inv.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite form */}
      {canManage && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Invite a collaborator</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Email (optional)</Label>
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                type="email"
              />
            </div>
            <div className="w-28 space-y-1">
              <Label className="text-xs">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleEmailInvite}
              disabled={!inviteEmail.trim() || sending}
              className="gap-1.5"
              size="sm"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              Send Invite
            </Button>
            <Button
              onClick={handleGenerateLink}
              disabled={generatingLink}
              variant="outline"
              className="gap-1.5"
              size="sm"
            >
              {generatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
              Copy Share Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
