import { useState } from "react";
import { Check, Copy, Globe, Search } from "lucide-react";

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
}

export const ListingOutput = ({ marketplace, listing }: Props) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  return (
    <div className="mt-4 space-y-6 rounded-xl border border-border bg-card p-6">
      {/* Title */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Title
          </label>
          <CopyBtn text={listing.title} field="title" />
        </div>
        <p className="text-lg font-semibold leading-snug">{listing.title}</p>
      </div>

      {/* Description */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Description
          </label>
          <CopyBtn text={listing.description} field="desc" />
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-secondary-foreground">
          {listing.description}
        </p>
      </div>

      {/* Bullet Points */}
      {listing.bulletPoints.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bullet Points
            </label>
            <CopyBtn
              text={listing.bulletPoints.map((b) => `• ${b}`).join("\n")}
              field="bullets"
            />
          </div>
          <ul className="space-y-1.5">
            {listing.bulletPoints.map((bp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {bp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags */}
      {listing.tags.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tags / Keywords
            </label>
            <CopyBtn text={listing.tags.join(", ")} field="tags" />
          </div>
          <div className="flex flex-wrap gap-2">
            {listing.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SEO Metadata */}
      {hasSeo && (
        <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              SEO Metadata
            </label>
          </div>

          {listing.seoTitle && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Meta Title</span>
                <CopyBtn text={listing.seoTitle} field="seoTitle" />
              </div>
              <p className="text-sm font-medium">{listing.seoTitle}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{listing.seoTitle.length}/60 chars</p>
            </div>
          )}

          {listing.seoDescription && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Meta Description</span>
                <CopyBtn text={listing.seoDescription} field="seoDesc" />
              </div>
              <p className="text-sm text-secondary-foreground">{listing.seoDescription}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{listing.seoDescription.length}/160 chars</p>
            </div>
          )}

          {listing.urlHandle && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">URL Handle</span>
                <CopyBtn text={listing.urlHandle} field="urlHandle" />
              </div>
              <p className="text-sm font-mono text-secondary-foreground">/{listing.urlHandle}</p>
            </div>
          )}

          {listing.altText && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Image Alt Text</span>
                <CopyBtn text={listing.altText} field="altText" />
              </div>
              <p className="text-sm text-secondary-foreground">{listing.altText}</p>
            </div>
          )}
        </div>
      )}

      {/* Copy All */}
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
            <>
              <Check className="h-4 w-4" /> Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" /> Copy Entire Listing
            </>
          )}
        </button>
      </div>
    </div>
  );
};
