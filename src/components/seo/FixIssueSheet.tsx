import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { SEO_RULES, validateListing, toUrlHandle } from "@/lib/seoRules";
import type { ScanReportPage, ProductMatch } from "@/integrations/seo-backend/types";

interface FixIssueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: ScanReportPage | null;
}

interface ListingRow {
  id: string;
  product_id: string;
  marketplace: string;
  title: string;
  seo_title: string;
  seo_description: string;
  url_handle: string;
  alt_text: string;
  description: string;
  tags: string[];
}

export const FixIssueSheet = ({ open, onOpenChange, page }: FixIssueSheetProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [listing, setListing] = useState<ListingRow | null>(null);

  // Editable draft
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [urlHandle, setUrlHandle] = useState("");
  const [altText, setAltText] = useState("");

  const match = page?.productMatch as ProductMatch | null | undefined;

  useEffect(() => {
    if (!open || !match?.listingId) {
      setListing(null);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, product_id, marketplace, title, seo_title, seo_description, url_handle, alt_text, description, tags")
        .eq("id", match.listingId!)
        .maybeSingle();
      if (error) {
        toast.error("Couldn't load listing");
      } else if (data) {
        const row = data as any as ListingRow;
        setListing(row);
        setSeoTitle(row.seo_title || row.title || "");
        setSeoDescription(row.seo_description || "");
        setUrlHandle(row.url_handle || "");
        setAltText(row.alt_text || "");
      }
      setLoading(false);
    })();
  }, [open, match?.listingId]);

  const draftIssues = validateListing({
    title: listing?.title,
    description: listing?.description,
    seoTitle,
    seoDescription,
    urlHandle,
    altText,
    tags: listing?.tags,
  });

  const handleAiSuggest = async () => {
    if (!listing) return;
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-listings", {
        body: {
          enhanceOnly: false,
          marketplaces: [listing.marketplace],
          business: {},
          product: {
            title: listing.title,
            description: listing.description,
            keywords: (listing.tags || []).join(", "),
            category: "",
          },
        },
      });
      if (error) throw error;
      const suggested = data?.[listing.marketplace];
      if (suggested) {
        if (suggested.seoTitle) setSeoTitle(suggested.seoTitle);
        if (suggested.seoDescription) setSeoDescription(suggested.seoDescription);
        if (suggested.urlHandle) setUrlHandle(suggested.urlHandle);
        if (suggested.altText) setAltText(suggested.altText);
        toast.success("AI suggestions loaded — review and save");
      } else {
        toast.error("No suggestion returned");
      }
    } catch (e: any) {
      toast.error(e?.message || "AI suggest failed");
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    if (!listing) return;
    setSaving(true);
    const { error } = await supabase
      .from("listings")
      .update({
        seo_title: seoTitle.trim(),
        seo_description: seoDescription.trim(),
        url_handle: urlHandle.trim(),
        alt_text: altText.trim(),
      })
      .eq("id", listing.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Saved. Push to your marketplace to publish the changes.");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Fix SEO issues</SheetTitle>
          <SheetDescription className="break-all">{page?.url}</SheetDescription>
        </SheetHeader>

        {!match?.listingId ? (
          <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
            This page isn't linked to a Brand Aura listing yet. Fixes have to be made in your storefront. Make sure the URL handle of your published listing matches a product in this brand to enable in-app fixes.
          </div>
        ) : loading ? (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading listing…
          </div>
        ) : listing ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <div className="mb-2 font-semibold text-foreground">Issues found on this page</div>
              <ul className="space-y-1">
                {page!.issues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Badge variant={i.severity === "error" ? "destructive" : i.severity === "warning" ? "default" : "secondary"}>
                      {i.severity}
                    </Badge>
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Editing {listing.marketplace} listing — changes save locally, then push to publish.
              </div>
              <Button size="sm" variant="outline" onClick={handleAiSuggest} disabled={suggesting}>
                {suggesting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                AI suggest
              </Button>
            </div>

            <Field
              label="SEO title"
              hint={`${SEO_RULES.title.min}–${SEO_RULES.title.max} chars`}
              value={seoTitle}
              max={SEO_RULES.title.max}
            >
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
            </Field>

            <Field
              label="Meta description"
              hint={`${SEO_RULES.metaDescription.min}–${SEO_RULES.metaDescription.max} chars`}
              value={seoDescription}
              max={SEO_RULES.metaDescription.max}
            >
              <Textarea rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
            </Field>

            <Field
              label="URL handle"
              hint={`lowercase, hyphens, max ${SEO_RULES.urlHandle.max} chars`}
              value={urlHandle}
              max={SEO_RULES.urlHandle.max}
            >
              <div className="flex gap-2">
                <Input value={urlHandle} onChange={(e) => setUrlHandle(e.target.value)} />
                <Button size="sm" variant="outline" type="button" onClick={() => setUrlHandle(toUrlHandle(seoTitle || listing.title))}>
                  Slugify
                </Button>
              </div>
            </Field>

            <Field
              label="Image alt text"
              hint={`${SEO_RULES.altText.min}–${SEO_RULES.altText.max} chars`}
              value={altText}
              max={SEO_RULES.altText.max}
            >
              <Input value={altText} onChange={(e) => setAltText(e.target.value)} />
            </Field>

            {draftIssues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
                <CheckCircle2 className="h-4 w-4" /> All SEO rules pass.
              </div>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="mb-1 font-semibold">{draftIssues.length} issue(s) remain in your draft</div>
                <ul className="list-disc space-y-1 pl-4">
                  {draftIssues.map((i, idx) => <li key={idx}>{i.message}</li>)}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <a
                href={page!.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Open live page <ExternalLink className="h-3 w-3" />
              </a>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

const Field = ({ label, hint, value, max, children }: { label: string; hint: string; value: string; max: number; children: React.ReactNode }) => {
  const len = value.length;
  const overMax = len > max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className={`text-xs ${overMax ? "text-destructive" : "text-muted-foreground"}`}>
          {len} / {max} — {hint}
        </span>
      </div>
      {children}
    </div>
  );
};
