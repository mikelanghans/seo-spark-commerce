// TikTok Shop bulk-upload .xlsx generator.
//
// Rather than building a workbook from scratch (which would lose TikTok's
// hidden config sheets, dropdowns, and per-seller warehouse columns), we
// load the user-provided template from src/assets and write rows into the
// "Template" sheet starting at row 3.
//
// IMPORTANT: TikTok templates contain seller-specific warehouse IDs and
// category-specific property/qualification IDs in row 1 (machine-readable
// field codes). Do NOT regenerate them — preserve the template binary.
//
// See mem://integrations/tiktok-shop/bulk-template for full schema.

import ExcelJS from "exceljs";
import templateUrl from "@/assets/tiktok-templates/womens-tshirts-v5.0.2.xlsx?url";
import { supabase } from "@/integrations/supabase/client";

export interface TikTokExportProduct {
  id: string;
  title: string;
  description: string;
  price: string;
  category?: string;
  size_pricing?: Record<string, number> | null;
  printify_product_id?: string | null;
}

interface TikTokExportListing {
  marketplace: string;
  title: string;
  description: string;
  // bullet_points may exist but TikTok prefers paragraph-style descriptions
  bullet_points?: string[];
}

interface TikTokExportImage {
  image_url: string;
  color_name?: string;
  position?: number;
  image_type?: string;
}

const DEFAULT_PARCEL = { weight: 0.5, length: 10, width: 8, height: 1 }; // T-shirt defaults (lb / inch)
const DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL"];
const DEFAULT_CATEGORY = "Womenswear & Underwear/Tops/T-Shirts";
const DEFAULT_DELIVERY = "Default";

// Field-code → column-index map (1-based) — matches V5.0.2 template row 1.
// Built from the user's actual uploaded template; warehouse IDs vary per seller.
const FIELD_MAP_BASE: Record<string, number> = {
  category: 1,
  brand: 2,
  product_name: 3,
  product_description: 4,
  main_image: 5,
  image_2: 6, image_3: 7, image_4: 8, image_5: 9, image_6: 10, image_7: 11, image_8: 12, image_9: 13,
  gtin_type: 14,
  gtin_code: 15,
  property_name_1: 16,
  property_value_1: 17,
  property_1_image: 18,
  property_name_2: 27,
  property_value_2: 28,
  parcel_weight: 29,
  parcel_length: 30,
  parcel_width: 31,
  parcel_height: 32,
  delivery: 33,
  price: 34,
  list_price: 35,
  // 36-38 are warehouse_quantity/* columns (per-seller)
  seller_sku: 39,
  size_chart: 40,
  // 42-57 are product_property/* (T-shirts category)
  // 58 is qualification/*
  aimed_product_status: 59,
};

const slugify = (s: string): string =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const stripMarkdown = (s: string): string =>
  (s || "")
    .replace(/[#*_`>~]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Pick the TikTok-specific listing if it exists, else fall back to Etsy/Shopify. */
function pickListing(listings: TikTokExportListing[]): TikTokExportListing | null {
  if (!listings || listings.length === 0) return null;
  return (
    listings.find((l) => l.marketplace === "tiktok") ||
    listings.find((l) => l.marketplace === "shopify") ||
    listings.find((l) => l.marketplace === "etsy") ||
    listings[0]
  );
}

interface BuildOptions {
  /** Quantity to assign to the FIRST warehouse column found (default 1000). Other warehouses get 0. */
  defaultQty?: number;
  /** Override the category dropdown value. */
  category?: string;
  /** Sizes to include per color (default S–2XL). */
  sizes?: string[];
}

interface ProductBundle {
  product: TikTokExportProduct;
  listings: TikTokExportListing[];
  images: TikTokExportImage[];
}

/** Build & download a TikTok-Shop-ready .xlsx for one or more products. */
export async function exportProductsToTikTokXlsx(
  bundles: ProductBundle[],
  filename: string,
  options: BuildOptions = {}
): Promise<void> {
  if (bundles.length === 0) throw new Error("No products to export");

  const defaultQty = options.defaultQty ?? 1000;
  const category = options.category ?? DEFAULT_CATEGORY;
  const sizes = options.sizes ?? DEFAULT_SIZES;

  // Load the binary template
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error("Failed to load TikTok template asset");
  const buf = await res.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Template");
  if (!ws) throw new Error("Template sheet missing from TikTok .xlsx — was the wrong template uploaded?");

  // Detect warehouse columns dynamically from row 1 (field codes contain "warehouse_quantity/<id>")
  const warehouseCols: number[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const v = String(cell.value ?? "");
    if (v.startsWith("warehouse_quantity/")) warehouseCols.push(col);
  });
  // Fallback: assume 36-38 if detection fails
  const finalWarehouseCols = warehouseCols.length > 0 ? warehouseCols : [36, 37, 38];

  // Wipe any sample rows below header (rows 3+). Template ships with 1998 blank rows; we just write fresh.
  // ExcelJS doesn't have a great "delete rows" API, so we'll overwrite from row 3.
  let rowIdx = 3;

  for (const bundle of bundles) {
    const { product, images } = bundle;
    const listing = pickListing(bundle.listings);
    const productName = (listing?.title || product.title || "Untitled product").slice(0, 255);
    const productDescription = stripMarkdown(listing?.description || product.description || "").slice(0, 5000);
    const skuBase = slugify(product.title || "product");

    // Group images by color (mockups). If no colors found, use one row per size with main image only.
    const mockups = images.filter((i) => i.image_type === "mockup" || !i.image_type);
    const byColor = new Map<string, TikTokExportImage[]>();
    for (const img of mockups) {
      const key = img.color_name || "Default";
      if (!byColor.has(key)) byColor.set(key, []);
      byColor.get(key)!.push(img);
    }
    if (byColor.size === 0) {
      byColor.set("Default", [{ image_url: images[0]?.image_url || "", color_name: "Default" }]);
    }

    const mainImageUrl = images[0]?.image_url || "";
    const additionalImages = images.slice(0, 9).map((i) => i.image_url); // up to 9 product-level images

    for (const [color, colorImages] of byColor.entries()) {
      const colorImageUrl = colorImages[0]?.image_url || mainImageUrl;
      for (const size of sizes) {
        const row = ws.getRow(rowIdx++);
        const sizePrice = product.size_pricing?.[size] ?? Number(product.price) ?? 0;

        row.getCell(FIELD_MAP_BASE.category).value = category;
        row.getCell(FIELD_MAP_BASE.product_name).value = productName;
        row.getCell(FIELD_MAP_BASE.product_description).value = productDescription;
        row.getCell(FIELD_MAP_BASE.main_image).value = mainImageUrl;
        for (let i = 0; i < 8; i++) {
          const img = additionalImages[i + 1];
          if (img) row.getCell(FIELD_MAP_BASE.image_2 + i).value = img;
        }
        row.getCell(FIELD_MAP_BASE.property_name_1).value = "Color";
        row.getCell(FIELD_MAP_BASE.property_value_1).value = color;
        row.getCell(FIELD_MAP_BASE.property_1_image).value = colorImageUrl;
        row.getCell(FIELD_MAP_BASE.property_name_2).value = "Size";
        row.getCell(FIELD_MAP_BASE.property_value_2).value = size;
        row.getCell(FIELD_MAP_BASE.parcel_weight).value = DEFAULT_PARCEL.weight;
        row.getCell(FIELD_MAP_BASE.parcel_length).value = DEFAULT_PARCEL.length;
        row.getCell(FIELD_MAP_BASE.parcel_width).value = DEFAULT_PARCEL.width;
        row.getCell(FIELD_MAP_BASE.parcel_height).value = DEFAULT_PARCEL.height;
        row.getCell(FIELD_MAP_BASE.delivery).value = DEFAULT_DELIVERY;
        row.getCell(FIELD_MAP_BASE.price).value = sizePrice;
        row.getCell(FIELD_MAP_BASE.seller_sku).value = `${skuBase}-${slugify(color)}-${slugify(size)}`;

        // Stock the FIRST warehouse with defaultQty, leave others at 0
        finalWarehouseCols.forEach((col, i) => {
          row.getCell(col).value = i === 0 ? defaultQty : 0;
        });
        row.commit();
      }
    }
  }

  // Trigger download
  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: fetch a single product's listings + images and export. */
export async function exportSingleProductToTikTok(product: TikTokExportProduct): Promise<void> {
  const [{ data: listings }, { data: images }] = await Promise.all([
    supabase
      .from("listings")
      .select("marketplace, title, description, bullet_points")
      .eq("product_id", product.id),
    supabase
      .from("product_images")
      .select("image_url, color_name, position, image_type")
      .eq("product_id", product.id)
      .order("position", { ascending: true }),
  ]);

  await exportProductsToTikTokXlsx(
    [{
      product,
      listings: (listings || []).map((l) => ({
        marketplace: l.marketplace,
        title: l.title,
        description: l.description,
        bullet_points: Array.isArray(l.bullet_points) ? (l.bullet_points as string[]) : [],
      })),
      images: (images || []).map((i) => ({
        image_url: i.image_url,
        color_name: i.color_name || "",
        position: i.position ?? 0,
        image_type: i.image_type || "mockup",
      })),
    }],
    `tiktok-${slugify(product.title || "product")}.xlsx`,
  );
}

/** Bulk export: fetch listings + images for all selected products and bundle into one .xlsx. */
export async function exportProductsBulkToTikTok(products: TikTokExportProduct[]): Promise<void> {
  if (products.length === 0) throw new Error("Select products first");
  const ids = products.map((p) => p.id);
  const [{ data: allListings }, { data: allImages }] = await Promise.all([
    supabase
      .from("listings")
      .select("product_id, marketplace, title, description, bullet_points")
      .in("product_id", ids),
    supabase
      .from("product_images")
      .select("product_id, image_url, color_name, position, image_type")
      .in("product_id", ids)
      .order("position", { ascending: true }),
  ]);

  const listingsByProduct = new Map<string, TikTokExportListing[]>();
  for (const l of allListings || []) {
    const arr = listingsByProduct.get(l.product_id) || [];
    arr.push({
      marketplace: l.marketplace,
      title: l.title,
      description: l.description,
      bullet_points: Array.isArray(l.bullet_points) ? (l.bullet_points as string[]) : [],
    });
    listingsByProduct.set(l.product_id, arr);
  }
  const imagesByProduct = new Map<string, TikTokExportImage[]>();
  for (const i of allImages || []) {
    const arr = imagesByProduct.get(i.product_id) || [];
    arr.push({
      image_url: i.image_url,
      color_name: i.color_name || "",
      position: i.position ?? 0,
      image_type: i.image_type || "mockup",
    });
    imagesByProduct.set(i.product_id, arr);
  }

  const bundles = products.map((p) => ({
    product: p,
    listings: listingsByProduct.get(p.id) || [],
    images: imagesByProduct.get(p.id) || [],
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  await exportProductsToTikTokXlsx(bundles, `tiktok-export-${stamp}.xlsx`);
}
