import { useEffect } from "react";

const SITE_URL = "https://brandaura.syncopateddynamics.com";

interface PageSeoProps {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/** Per-route head tags. Pair with one <main> landmark per page. */
export const PageSeo = ({ title, description, path, noindex }: PageSeoProps) => {
  const url = `${SITE_URL}${path}`;
  useEffect(() => {
    document.title = title;
    setMeta(`meta[name="description"]`, "name", "description", description);
    setLink("canonical", url);
    setMeta(`meta[property="og:title"]`, "property", "og:title", title);
    setMeta(`meta[property="og:description"]`, "property", "og:description", description);
    setMeta(`meta[property="og:url"]`, "property", "og:url", url);
    setMeta(`meta[property="og:type"]`, "property", "og:type", "website");
    setMeta(`meta[name="twitter:card"]`, "name", "twitter:card", "summary_large_image");
    setMeta(`meta[name="twitter:title"]`, "name", "twitter:title", title);
    setMeta(`meta[name="twitter:description"]`, "name", "twitter:description", description);
    setMeta(`meta[name="robots"]`, "name", "robots", noindex ? "noindex,nofollow" : "index,follow");
  }, [title, description, url, noindex]);
  return null;
};
