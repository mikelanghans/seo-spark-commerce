import { useState } from "react";
import { Check, Copy, Globe, Search, Pencil, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface ListingData {
  title: string;
  description: string;
  tags: string[];
  bulletPoints: string[];
  seoTitle?: string;
  seoDescription?: string;
  urlHandle?: string;
  altText?: string;
}

interface Props {
  marketplace: string;
  listing: ListingData;
  onSave?: (updated: ListingData) => void;
}

export const ListingOutput = ({ marketplace, listing, onSave }: Props) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ListingData>(listing);

  const startEdit = () => {
    setDraft({ ...listing });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    onSave?.(draft);
    setEditing(false);
  };

  const copy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copy(text, field)}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      title="Copy"
    >
      {copiedField === field ? (
        <Check className="h-4 w-4 text-primary" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );

  const hasSeo = listing.seoTitle || listing.seoDescription || listing.urlHandle || listing.altText;

  const updateBullet = (idx: number, val: string) => {
    const bp = [...draft.bulletPoints];
    bp[idx] = val;
    setDraft({ ...draft, bulletPoints: bp });
  };

  const removeBullet = (idx: number) => {
    setDraft({ ...draft, bulletPoints: draft.bulletPoints.filter((_, i) => i !== idx) });
  };

  const addBullet = () => {
    setDraft({ ...draft, bulletPoints: [...draft.bulletPoints, ""] });
  };

  const updateTag = (idx: number, val: string) => {
    const t = [...draft.tags];
    t[idx] = val;
    setDraft({ ...draft, tags: t });
  };

  const removeTag = (idx: number) => {
    setDraft({ ...draft, tags: draft.tags.filter((_, i) => i !== idx) });
  };

  const addTag = () => {
    setDraft({ ...draft, tags: [...draft.tags, ""] });
  };

  return (
    <div className="mt-4 space-y-6 rounded-xl border border-border bg-card p-6">
      {/* Edit / Save Controls */}
      <div className="flex items-center justify-end gap-2">
        {editing ? (
          <>
            <Button variant="ghost" size="sm" onClick={cancelEdit} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        ) : (
          onSave && (
            <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )
        )}
      </div>

      {/* Title */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
          {!editing && <CopyBtn text={listing.title} field="title" />}
        </div>
        {editing ? (
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        ) : (
          <p className="text-lg font-semibold leading-snug">{listing.title}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
          {!editing && <CopyBtn text={listing.description} field="desc" />}
        </div>
        {editing ? (
          <Textarea rows={6} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        ) : (
          <p className="whitespace-pre-line text-sm leading-relaxed text-secondary-foreground">{listing.description}</p>
        )}
      </div>

      {/* Bullet Points */}
      {(editing || listing.bulletPoints.length > 0) && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bullet Points</label>
            {!editing && <CopyBtn text={listing.bulletPoints.map((b) => `• ${b}`).join("\n")} field="bullets" />}
          </div>
          {editing ? (
            <div className="space-y-2">
              {draft.bulletPoints.map((bp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={bp} onChange={(e) => updateBullet(i, e.target.value)} className="flex-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeBullet(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addBullet}>+ Add bullet</Button>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {listing.bulletPoints.map((bp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {bp}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Tags */}
      {(editing || listing.tags.length > 0) && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags / Keywords</label>
            {!editing && <CopyBtn text={listing.tags.join(", ")} field="tags" />}
          </div>
          {editing ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {draft.tags.map((tag, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5">
                    <input
                      value={tag}
                      onChange={(e) => updateTag(i, e.target.value)}
                      className="bg-transparent text-xs font-medium text-secondary-foreground outline-none w-24"
                    />
                    <button onClick={() => removeTag(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addTag}>+ Add tag</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SEO Metadata */}
      {(editing || hasSeo) && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SEO Metadata</label>
          </div>

          {(editing || listing.seoTitle) && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Meta Title</span>
                {!editing && listing.seoTitle && <CopyBtn text={listing.seoTitle} field="seoTitle" />}
              </div>
              {editing ? (
                <Input value={draft.seoTitle || ""} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} placeholder="SEO title (max 60 chars)" />
              ) : (
                <>
                  <p className="text-sm font-medium">{listing.seoTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{listing.seoTitle!.length}/60 chars</p>
                </>
              )}
            </div>
          )}

          {(editing || listing.seoDescription) && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Meta Description</span>
                {!editing && listing.seoDescription && <CopyBtn text={listing.seoDescription} field="seoDesc" />}
              </div>
              {editing ? (
                <Textarea rows={2} value={draft.seoDescription || ""} onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })} placeholder="SEO description (max 160 chars)" />
              ) : (
                <>
                  <p className="text-sm text-secondary-foreground">{listing.seoDescription}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{listing.seoDescription!.length}/160 chars</p>
                </>
              )}
            </div>
          )}

          {(editing || listing.urlHandle) && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">URL Handle</span>
                {!editing && listing.urlHandle && <CopyBtn text={listing.urlHandle} field="urlHandle" />}
              </div>
              {editing ? (
                <Input value={draft.urlHandle || ""} onChange={(e) => setDraft({ ...draft, urlHandle: e.target.value })} placeholder="url-handle" />
              ) : (
                <p className="text-sm font-mono text-secondary-foreground">/{listing.urlHandle}</p>
              )}
            </div>
          )}

          {(editing || listing.altText) && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Image Alt Text</span>
                {!editing && listing.altText && <CopyBtn text={listing.altText} field="altText" />}
              </div>
              {editing ? (
                <Input value={draft.altText || ""} onChange={(e) => setDraft({ ...draft, altText: e.target.value })} placeholder="Descriptive alt text" />
              ) : (
                <p className="text-sm text-secondary-foreground">{listing.altText}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Copy All */}
      {!editing && (
        <div className="border-t border-border pt-4">
          <button
            onClick={() =>
              copy(
                `Title: ${listing.title}\n\nDescription:\n${listing.description}\n\nBullet Points:\n${listing.bulletPoints.map((b) => `• ${b}`).join("\n")}\n\nTags: ${listing.tags.join(", ")}${listing.seoTitle ? `\n\nSEO Title: ${listing.seoTitle}` : ""}${listing.seoDescription ? `\nSEO Description: ${listing.seoDescription}` : ""}${listing.urlHandle ? `\nURL: /${listing.urlHandle}` : ""}${listing.altText ? `\nAlt Text: ${listing.altText}` : ""}`,
                "all"
              )
            }
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {copiedField === "all" ? (
              <><Check className="h-4 w-4" /> Copied!</>
            ) : (
              <><Copy className="h-4 w-4" /> Copy Entire Listing</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
