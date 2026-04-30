import { useEffect, useState } from "react";
import { Check, Copy, Search, Pencil, Save, X, Sparkles, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

export interface SuggestionContext {
  business?: {
    name?: string;
    niche?: string;
    tone?: string;
    audience?: string;
  };
  product?: {
    title?: string;
    category?: string;
    description?: string;
  };
  excludedSections?: string[];
}

interface Props {
  marketplace: string;
  listing: ListingData;
  onSave?: (updated: ListingData) => void;
  suggestionContext?: SuggestionContext;
}

export const ListingOutput = ({ marketplace, listing, onSave, suggestionContext }: Props) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ListingData>(listing);

  // Suggestion state
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [suggestionRationale, setSuggestionRationale] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Re-sync draft whenever the underlying listing prop changes (e.g. after regeneration
  // or switching products). Prevents stale tags / SEO from leaking into edit mode.
  useEffect(() => {
    setDraft(listing);
    setEditing(false);
  }, [listing]);

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

  // Source of truth for tags currently shown (draft when editing, listing otherwise)
  const currentTags = (): string[] => (editing ? draft.tags : listing.tags).filter(Boolean);

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-keywords-tags", {
        body: {
          marketplace,
          existingTags: currentTags(),
          business: suggestionContext?.business || {},
          product: {
            title: suggestionContext?.product?.title || listing.title,
            category: suggestionContext?.product?.category || "",
            description: suggestionContext?.product?.description || listing.description,
          },
        },
      });
      if (error) {
        const msg = (error as any)?.message || "Failed to fetch suggestions";
        if (msg.includes("402")) toast.error("AI credits exhausted — add credits to continue.");
        else if (msg.includes("429")) toast.error("Rate limit reached — please wait a moment.");
        else toast.error(msg);
        setShowSuggestions(false);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        setShowSuggestions(false);
        return;
      }
      setSuggestedTags(Array.isArray(data?.tags) ? data.tags : []);
      setSuggestedKeywords(Array.isArray(data?.keywords) ? data.keywords : []);
      setSuggestionRationale(data?.rationale || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to fetch suggestions");
      setShowSuggestions(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addSuggestedTag = (tag: string) => {
    const lower = tag.toLowerCase();
    const existing = currentTags().map((t) => t.toLowerCase());
    if (existing.includes(lower)) return;

    if (editing) {
      setDraft({ ...draft, tags: [...draft.tags, tag] });
    } else if (onSave) {
      onSave({ ...listing, tags: [...listing.tags, tag] });
    }
    setSuggestedTags((prev) => prev.filter((t) => t !== tag));
  };

  const addAllSuggestedTags = () => {
    const existing = new Set(currentTags().map((t) => t.toLowerCase()));
    const toAdd = suggestedTags.filter((t) => !existing.has(t.toLowerCase()));
    if (toAdd.length === 0) return;

    if (editing) {
      setDraft({ ...draft, tags: [...draft.tags, ...toAdd] });
    } else if (onSave) {
      onSave({ ...listing, tags: [...listing.tags, ...toAdd] });
    }
    setSuggestedTags([]);
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
      {(editing || listing.tags.length > 0 || onSave) && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags / Keywords</label>
            <div className="flex items-center gap-1">
              {onSave && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchSuggestions}
                  disabled={loadingSuggestions}
                  className="h-7 gap-1.5 px-2 text-xs"
                  title="Suggest more keywords & tags based on your product type and target audience"
                >
                  {loadingSuggestions ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  Suggest more
                </Button>
              )}
              {!editing && listing.tags.length > 0 && <CopyBtn text={listing.tags.join(", ")} field="tags" />}
            </div>
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
            listing.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{tag}</span>
                ))}
              </div>
            )
          )}

          {/* AI Suggestions Panel */}
          {showSuggestions && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    AI Suggestions for {marketplace}
                  </span>
                </div>
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Hide suggestions"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {loadingSuggestions ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing product type and audience…
                </div>
              ) : (
                <>
                  {suggestionRationale && (
                    <p className="text-xs italic text-muted-foreground">{suggestionRationale}</p>
                  )}

                  {suggestedTags.length > 0 ? (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Tap a tag to add it</span>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={addAllSuggestedTags}>
                          Add all
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => addSuggestedTag(tag)}
                            className="group flex items-center gap-1 rounded-full border border-primary/40 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                          >
                            <Plus className="h-3 w-3 opacity-70 group-hover:opacity-100" />
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No new tag ideas — your tags already cover the obvious angles.</p>
                  )}

                  {suggestedKeywords.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Long-tail SEO keywords</span>
                        <button
                          onClick={() => copy(suggestedKeywords.join(", "), "suggKw")}
                          className="text-xs text-primary hover:underline"
                        >
                          {copiedField === "suggKw" ? "Copied" : "Copy all"}
                        </button>
                      </div>
                      <ul className="space-y-1">
                        {suggestedKeywords.map((kw) => (
                          <li key={kw} className="flex items-start gap-2 text-xs text-secondary-foreground">
                            <Search className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <span>{kw}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={fetchSuggestions} disabled={loadingSuggestions}>
                      <Sparkles className="h-3 w-3" /> Suggest different ideas
                    </Button>
                  </div>
                </>
              )}
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
