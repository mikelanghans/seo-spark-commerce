import { BusinessContext } from "@/components/BusinessContextForm";
import { ProductInfo } from "@/components/ProductForm";
import { ListingData } from "@/components/ListingOutput";

export type MarketplaceListings = Record<string, ListingData>;

export function generateListings(
  biz: BusinessContext,
  product: ProductInfo
): MarketplaceListings {
  const keywords = product.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const features = product.features
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  return {
    etsy: {
      title: `${product.title} | ${biz.niche} | Handcrafted by ${biz.name} | Gift for ${biz.audience}`,
      description: `✨ ${product.title} ✨\n\n${product.description}\n\n🎁 Perfect for ${biz.audience}\n\nEach piece is crafted with care by ${biz.name}. Our ${biz.tone.toLowerCase()} approach ensures every item meets the highest standards.\n\n📦 What you'll receive:\n${features.map((f) => `• ${f}`).join("\n")}\n\n${product.price ? `💰 ${product.price}` : ""}\n\nThank you for supporting small business! 🧡`,
      bulletPoints: features,
      tags: [...keywords, biz.niche, "handmade", "gift idea", "unique", biz.name.toLowerCase().replace(/\s+/g, "")].slice(0, 13),
    },
    ebay: {
      title: `${product.title} - ${features[0] || biz.niche} - ${biz.name} - Brand New`,
      description: `${product.title}\n\nBrand: ${biz.name}\nCategory: ${product.category}\n${product.price ? `Price: ${product.price}` : ""}\n\n${product.description}\n\nFeatures:\n${features.map((f) => `- ${f}`).join("\n")}\n\nIdeal for: ${biz.audience}\n\nWe are ${biz.name}, specializing in ${biz.niche}. All items ship promptly with care. Satisfaction guaranteed.\n\nBuy with confidence — check our seller reviews!`,
      bulletPoints: features,
      tags: [...keywords, biz.niche, "brand new", "fast shipping", "trusted seller"].slice(0, 10),
    },
    shopify: {
      title: product.title,
      description: `${product.description}\n\n## Why ${product.title}?\n\n${features.map((f) => `✓ ${f}`).join("\n")}\n\n## Made for ${biz.audience}\n\nAt ${biz.name}, we believe in ${biz.tone.toLowerCase()} quality. Every product in our ${biz.niche} collection is crafted to exceed expectations.\n\n${product.price ? `**${product.price}**` : ""}`,
      bulletPoints: features,
      tags: [...keywords, biz.niche].slice(0, 8),
    },
  };
}
