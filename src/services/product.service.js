import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';

/**
 * Get product by SKU with variant and supplier.
 * Returns null if not found.
 */
export async function getProductBySku(sku) {
  if (!sku || typeof sku !== 'string') return null;
  return prisma.product.findUnique({
    where: { sku: sku.trim() },
    include: {
      productVariant: true,
      supplier: true,
    },
  });
}

/**
 * Build SKU prefix from category slug (or fallback).
 */
function skuPrefix(category) {
  const base = category.slug || `cat-${category.id.slice(0, 6)}`;
  return base
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Build attribute short-codes: first 3 chars of each value,
 * sorted by key, hyphenated.
 */
function attributeShortCodes(attributesJson) {
  if (!attributesJson || typeof attributesJson !== 'object') return '';

  const entries = Object.entries(attributesJson)
    .filter(([, v]) => v != null)
    .sort(([a], [b]) => a.localeCompare(b));

  return entries
    .map(([, v]) => String(v).slice(0, 3).toLowerCase())
    .join('-');
}

/**
 * Get next per-category SKU counter.
 * NOTE: safe for dev; production hardening can be added later.
 */
async function nextCategoryCounter(categoryId) {
  const products = await prisma.product.findMany({
    where: { productVariant: { categoryId } },
    select: { sku: true },
  });

  let max = 0;
  for (const { sku } of products) {
    const last = sku.split('-').pop();
    const n = parseInt(last, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }

  return max + 1;
}

/**
 * Generate unique SKU: prefix-attrCodes-counter
 * Example: saree-red-ban-0001
 */
export async function generateSku(categoryId, attributesJson) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, slug: true },
  });

  if (!category) return null;

  const prefix = skuPrefix(category);
  const attrPart = attributeShortCodes(attributesJson);
  const base = attrPart ? `${prefix}-${attrPart}` : prefix;

  const counter = await nextCategoryCounter(categoryId);
  const suffix = String(counter).padStart(4, '0');

  return `${base}-${suffix}`;
}

/**
 * Create ProductVariant + Product atomically.
 * Returns { productId, sku }
 */
export async function createProduct(data) {
  const {
    categoryId,
    subcategoryId,
    attributes_json,
    mrp,
    default_selling_price,
    max_discount_percent,
    supplierId,
    quantity,
    quantityInStock,
  } = data;
  const qty = quantityInStock ?? quantity;

  // ---- validation ----
  const missing = [];
  if (!categoryId) missing.push('categoryId');
  if (!supplierId) missing.push('supplierId');
  if (mrp == null) missing.push('mrp');
  if (default_selling_price == null) missing.push('default_selling_price');
  if (max_discount_percent == null) missing.push('max_discount_percent');
  if (!attributes_json) missing.push('attributes_json');

  if (missing.length) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const supplierIdStr = String(supplierId);

  if (default_selling_price > mrp) {
    const err = new Error('default_selling_price must be <= mrp');
    err.statusCode = 400;
    throw err;
  }

  if (max_discount_percent > 100) {
    const err = new Error('max_discount_percent must be <= 100');
    err.statusCode = 400;
    throw err;
  }

  const sku = await generateSku(categoryId, attributes_json);
  if (!sku) {
    const err = new Error('Category not found');
    err.statusCode = 404;
    throw err;
  }

  const variantId = randomUUID();

  // ---- atomic save ----
  const product = await prisma.$transaction(async (tx) => {
    await tx.productVariant.create({
      data: {
        id: variantId,
        categoryId,
        subcategoryId: subcategoryId ?? null,
        attributes_json,
        mrp,
        default_selling_price,
        max_discount_percent,
      },
    });

    return tx.product.create({
      data: {
        sku,
        productVariantId: variantId,
        supplierId: supplierIdStr,
        quantityInStock: Number(qty) || 0,
      },
    });
  });

  return { productId: product.id, sku };
}
