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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Users, Copy, Mail, Loader2, Trash2, Crown, Pencil, Eye,
  Link, ChevronDown, Building2,
} from "lucide-react";
import { toast } from "sonner";

interface OrgInfo {
  id: string;
  name: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  organization_id: string;
}

interface Invite {
  id: string;
  invited_email: string | null;
  invite_token: string;
  role: string;
  organization_id: string;
}

interface Props {
  userId: string;
  organizations: OrgInfo[];
}

export const CollaborationHub = ({ userId, organizations }: Props) => {
  const [teamsByOrg, setTeamsByOrg] = useState<Record<string, { members: Member[]; invites: Invite[]; myRole: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [openOrgs, setOpenOrgs] = useState<Set<string>>(new Set());

  // Invite form state
  const [inviteOrgId, setInviteOrgId] = useState<string>(organizations[0]?.id || "");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [sending, setSending] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    loadAllTeams();
  }, [organizations.length]);

  const loadAllTeams = async () => {
    setLoading(true);
    const orgIds = organizations.map((o) => o.id);
    if (orgIds.length === 0) {
      setLoading(false);
      return;
    }

    const [{ data: membersData }, { data: invitesData }] = await Promise.all([
      supabase.from("organization_members").select("*").in("organization_id", orgIds).order("created_at"),
      supabase.from("organization_invites").select("*").in("organization_id", orgIds).is("accepted_at", null).order("created_at", { ascending: false }),
    ]);

    const result: Record<string, { members: Member[]; invites: Invite[]; myRole: string | null }> = {};
    for (const org of organizations) {
      const members = (membersData || []).filter((m: any) => m.organization_id === org.id) as Member[];
      const invites = (invitesData || []).filter((i: any) => i.organization_id === org.id) as Invite[];
      const me = members.find((m) => m.user_id === userId);
      result[org.id] = { members, invites, myRole: me?.role || null };
    }
    setTeamsByOrg(result);
    setLoading(false);
  };

  const toggleOrg = (orgId: string) => {
    setOpenOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const roleIcon = (role: string) => {
    if (role === "owner") return <Crown className="h-3.5 w-3.5 text-amber-500" />;
    if (role === "editor") return <Pencil className="h-3.5 w-3.5 text-primary" />;
    return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const copyTextWithFallback = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Continue to fallback
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  };

  const handleEmailInvite = async () => {
    if (!inviteEmail.trim() || !inviteOrgId) return;
    setSending(true);
    try {
      const { error } = await supabase.from("organization_invites").insert({
        organization_id: inviteOrgId,
        invited_email: inviteEmail.trim().toLowerCase(),
        role: inviteRole as any,
        invited_by: userId,
      });
      if (error) throw error;
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      await loadAllTeams();
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite");
    } finally {
      setSending(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!inviteOrgId) return;
    setGeneratingLink(true);
    try {
      const { data, error } = await supabase
        .from("organization_invites")
        .insert({ organization_id: inviteOrgId, role: inviteRole as any, invited_by: userId })
        .select("invite_token")
        .single();
      if (error) throw error;

      const link = `${window.location.origin}/invite/${data.invite_token}`;
      const copied = await copyTextWithFallback(link);

      if (copied) {
        toast.success("Invite link copied to clipboard!");
      } else {
        window.prompt("Copy this invite link:", link);
        toast.success("Invite link created — copy it from the dialog.");
      }

      await loadAllTeams();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate link");
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === userId) {
      toast.error("You can't remove yourself");
      return;
    }
    const { error } = await supabase.from("organization_members").delete().eq("id", memberId);
    if (error) toast.error("Failed to remove member");
    else { toast.success("Member removed"); await loadAllTeams(); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    const { error } = await supabase.from("organization_invites").delete().eq("id", inviteId);
    if (error) toast.error("Failed to revoke invite");
    else { toast.success("Invite revoked"); await loadAllTeams(); }
  };

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    const copied = await copyTextWithFallback(link);

    if (copied) {
      toast.success("Link copied!");
    } else {
      window.prompt("Copy this invite link:", link);
      toast.success("Invite link ready — copy it from the dialog.");
    }
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
          Collaboration
        </h3>
        <p className="text-sm text-muted-foreground">
          Manage team access across your brands
        </p>
      </div>

      {/* Teams per brand */}
      <div className="space-y-2">
        {organizations.map((org) => {
          const data = teamsByOrg[org.id];
          if (!data) return null;
          const isOpen = openOrgs.has(org.id);
          const isOwner = data.myRole === "owner";
          const totalCollaborators = data.members.length - 1; // exclude self
          const pendingCount = data.invites.length;

          return (
            <Collapsible key={org.id} open={isOpen} onOpenChange={() => toggleOrg(org.id)}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      {data.members.length} {data.members.length === 1 ? "member" : "members"}
                    </span>
                    {pendingCount > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {pendingCount} pending
                      </span>
                    )}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1 pl-4 space-y-1">
                {data.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      {roleIcon(m.role)}
                      <span className="text-sm">
                        {m.user_id === userId ? "You" : m.user_id.slice(0, 8) + "..."}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">
                        {m.role}
                      </span>
                    </div>
                    {isOwner && m.user_id !== userId && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRemoveMember(m.id, m.user_id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {data.invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-md border border-dashed border-border bg-background p-2.5">
                    <div className="flex items-center gap-2">
                      {inv.invited_email ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <Link className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-sm text-muted-foreground">{inv.invited_email || "Share link"}</span>
                      <span className="text-xs text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{inv.role}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyLink(inv.invite_token)} title="Copy link">
                        <Copy className="h-3 w-3" />
                      </Button>
                      {isOwner && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleRevokeInvite(inv.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {data.members.length === 1 && data.invites.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 pl-1">No collaborators yet</p>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Invite form */}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">Invite a collaborator</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-44 space-y-1">
            <Label className="text-xs">Brand</Label>
            <Select value={inviteOrgId} onValueChange={setInviteOrgId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select brand" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px] space-y-1">
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
          <Button onClick={handleEmailInvite} disabled={!inviteEmail.trim() || sending} className="gap-1.5" size="sm">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Send Invite
          </Button>
          <Button onClick={handleGenerateLink} disabled={generatingLink} variant="outline" className="gap-1.5" size="sm">
            {generatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
            Copy Share Link
          </Button>
        </div>
      </div>
    </div>
  );
};
