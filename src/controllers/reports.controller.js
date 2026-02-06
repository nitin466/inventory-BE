import prisma from '../lib/prisma.js';

const DEFAULT_PAYMENT_KEYS = ['CASH', 'CARD', 'UPI_N', 'UPI_S'];

/**
 * GET ?date=YYYY-MM-DD
 * Daily sales: totalBills, totalItems, totalRevenue, payments by mode
 */
export async function getDailySales(req, res) {
  try {
    const dateStr = req.query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'Query param date required (YYYY-MM-DD)' });
    }
    const start = new Date(dateStr + 'T00:00:00.000Z');
    const end = new Date(dateStr + 'T23:59:59.999Z');

    const sales = await prisma.sale.findMany({
      where: {
        soldAt: { gte: start, lte: end },
      },
      include: {
        items: true,
        payments: true,
      },
    });

    const totalBills = sales.length;
    const totalItems = sales.reduce(
      (sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0),
      0
    );
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);

    const payments = Object.fromEntries(DEFAULT_PAYMENT_KEYS.map((k) => [k, 0]));
    for (const s of sales) {
      for (const p of s.payments) {
        const mode = p.mode || 'CASH';
        if (!payments[mode]) payments[mode] = 0;
        payments[mode] += Number(p.amount);
      }
    }

    res.json({
      date: dateStr,
      totalBills,
      totalItems,
      totalRevenue,
      payments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * GET /reports/inventory
 * Inventory report: SKU, category name, attributes_json, quantityInStock, MRP, selling price
 * Uses Product → ProductVariant → Category
 */
export async function getInventorySnapshot(req, res) {
  try {
    const products = await prisma.product.findMany({
      include: {
        productVariant: {
          include: { category: true },
        },
      },
    });

    const list = products.map((p) => {
      const v = p.productVariant;
      return {
        sku: p.sku,
        categoryName: v?.category?.name ?? null,
        attributes_json: v?.attributes_json ?? null,
        quantityInStock: p.quantityInStock,
        mrp: v?.mrp ?? null,
        sellingPrice: v?.default_selling_price ?? null,
      };
    });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
 * Sales summary for date range: totalBills, totalItems, totalRevenue, payments by mode
 */
export async function getSalesSummary(req, res) {
  try {
    const { from, to } = req.query;
    const where = {};

    if (from) {
      where.soldAt = where.soldAt || {};
      where.soldAt.gte = new Date(from + 'T00:00:00.000Z');
    }
    if (to) {
      where.soldAt = where.soldAt || {};
      where.soldAt.lte = new Date(to + 'T23:59:59.999Z');
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { items: true, payments: true },
    });

    const totalBills = sales.length;
    const totalItems = sales.reduce(
      (sum, s) => sum + s.items.reduce((q, i) => q + i.quantity, 0),
      0
    );
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.totalAmount), 0);

    const payments = Object.fromEntries(DEFAULT_PAYMENT_KEYS.map((k) => [k, 0]));
    for (const s of sales) {
      for (const p of s.payments) {
        const mode = p.mode || 'CASH';
        if (!payments[mode]) payments[mode] = 0;
        payments[mode] += Number(p.amount);
      }
    }

    res.json({
      from: from ?? null,
      to: to ?? null,
      totalBills,
      totalItems,
      totalRevenue,
      payments,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function validateDateParam(value, paramName) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (!DATE_REGEX.test(str)) return { invalid: true, paramName, value: str };
  const d = new Date(str + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) return { invalid: true, paramName, value: str };
  return str;
}

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Sales list with items (sku, name, quantity, unitPrice, lineTotal) and payments by mode
 */
export async function getSalesList(req, res) {
  try {
    const { from, to } = req.query;

    const fromValid = validateDateParam(from, 'from');
    const toValid = validateDateParam(to, 'to');
    if (fromValid && fromValid.invalid) {
      return res.status(400).json({
        error: `Invalid ${fromValid.paramName}: must be YYYY-MM-DD`,
      });
    }
    if (toValid && toValid.invalid) {
      return res.status(400).json({
        error: `Invalid ${toValid.paramName}: must be YYYY-MM-DD`,
      });
    }

    const where = {};
    if (fromValid && typeof fromValid === 'string') {
      where.soldAt = where.soldAt || {};
      where.soldAt.gte = new Date(fromValid + 'T00:00:00.000Z');
    }
    if (toValid && typeof toValid === 'string') {
      where.soldAt = where.soldAt || {};
      where.soldAt.lte = new Date(toValid + 'T23:59:59.999Z');
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
        payments: true,
      },
      orderBy: { soldAt: 'desc' },
    });

    const list = sales.map((s) => {
      const totalItems = s.items.reduce((sum, i) => sum + i.quantity, 0);
      const paymentsByMode = {};
      for (const p of s.payments) {
        const mode = p.mode || 'CASH';
        paymentsByMode[mode] = (paymentsByMode[mode] || 0) + Number(p.amount);
      }
      return {
        saleId: s.id,
        billNumber: s.billNumber ?? null,
        soldAt: s.soldAt,
        totalAmount: Number(s.totalAmount),
        totalItems,
        payments: paymentsByMode,
        items: s.items.map((i) => ({
          sku: i.product?.sku ?? null,
          name: i.product?.name ?? null,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
        })),
      };
    });

    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (optional)
 * Sales profit report using average cost from PurchaseItems.
 * Profit per line = (unitPrice - avgCost) × quantity; aggregated per sale.
 */
export async function getSalesProfit(req, res) {
  try {
    const { from, to } = req.query;
    const fromValid = validateDateParam(from, 'from');
    const toValid = validateDateParam(to, 'to');
    if (fromValid && fromValid.invalid) {
      return res.status(400).json({ error: `Invalid from: must be YYYY-MM-DD` });
    }
    if (toValid && toValid.invalid) {
      return res.status(400).json({ error: `Invalid to: must be YYYY-MM-DD` });
    }

    const where = {};
    if (fromValid && typeof fromValid === 'string') {
      where.soldAt = where.soldAt || {};
      where.soldAt.gte = new Date(fromValid + 'T00:00:00.000Z');
    }
    if (toValid && typeof toValid === 'string') {
      where.soldAt = where.soldAt || {};
      where.soldAt.lte = new Date(toValid + 'T23:59:59.999Z');
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: { product: true },
        },
      },
      orderBy: { soldAt: 'desc' },
    });

    const variantIds = [
      ...new Set(
        sales.flatMap((s) =>
          s.items.map((i) => i.product?.productVariantId).filter(Boolean)
        )
      ),
    ];

    const avgCostByVariant = {};
    if (variantIds.length > 0) {
      const purchaseItems = await prisma.purchaseItem.findMany({
        where: { productVariantId: { in: variantIds } },
      });
      const byVariant = {};
      for (const pi of purchaseItems) {
        const id = pi.productVariantId;
        if (!byVariant[id]) byVariant[id] = { costQty: 0, qty: 0 };
        const q = pi.quantity;
        const c = Number(pi.effectiveUnitCost);
        byVariant[id].costQty += c * q;
        byVariant[id].qty += q;
      }
      for (const id of Object.keys(byVariant)) {
        const { costQty, qty } = byVariant[id];
        avgCostByVariant[id] = qty > 0 ? costQty / qty : 0;
      }
    }

    let totalProfit = 0;
    const salesWithProfit = sales.map((s) => {
      let saleProfit = 0;
      for (const item of s.items) {
        const variantId = item.product?.productVariantId;
        const avgCost = variantId ? avgCostByVariant[variantId] ?? 0 : 0;
        const unitPrice = Number(item.unitPrice);
        const qty = item.quantity;
        const lineProfit = (unitPrice - avgCost) * qty;
        saleProfit += lineProfit;
      }
      saleProfit = Math.round(saleProfit * 100) / 100;
      totalProfit += saleProfit;
      return {
        saleId: s.id,
        billNumber: s.billNumber ?? null,
        soldAt: s.soldAt,
        totalAmount: Number(s.totalAmount),
        profit: saleProfit,
      };
    });
    totalProfit = Math.round(totalProfit * 100) / 100;

    res.json({
      from: from ?? null,
      to: to ?? null,
      sales: salesWithProfit,
      totalProfit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * GET /reports/inventory-valuation
 * Cost-based inventory valuation: stock × average purchase cost per variant.
 * Average cost = SUM(quantity × effectiveUnitCost) / SUM(quantity) from PurchaseItem.
 * Skips variants with zero stock. Not stored in DB.
 */
export async function getInventoryValuation(req, res) {
  try {
    const variants = await prisma.productVariant.findMany({
      include: {
        products: true,
        category: true,
      },
    });

    const variantIds = variants.map((v) => v.id);
    const purchaseItems = await prisma.purchaseItem.findMany({
      where: { productVariantId: { in: variantIds } },
    });

    const avgCostByVariant = {};
    for (const pi of purchaseItems) {
      const id = pi.productVariantId;
      if (!avgCostByVariant[id]) avgCostByVariant[id] = { costQty: 0, qty: 0 };
      const q = pi.quantity;
      const c = Number(pi.effectiveUnitCost);
      avgCostByVariant[id].costQty += c * q;
      avgCostByVariant[id].qty += q;
    }
    for (const id of Object.keys(avgCostByVariant)) {
      const { costQty, qty } = avgCostByVariant[id];
      avgCostByVariant[id] = qty > 0 ? costQty / qty : 0;
    }

    const result = [];
    for (const v of variants) {
      const stockQty = v.products.reduce((sum, p) => sum + p.quantityInStock, 0);
      if (stockQty === 0) continue;

      const avgCost = avgCostByVariant[v.id] ?? 0;
      const inventoryValue = Math.round(stockQty * avgCost * 100) / 100;
      const firstProduct = v.products[0];
      const sku = firstProduct?.sku ?? '—';

      result.push({
        productVariantId: v.id,
        sku,
        categoryName: v.category?.name ?? null,
        attributes: v.attributes_json ?? {},
        stockQty,
        avgCost: Math.round(avgCost * 100) / 100,
        inventoryValue,
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// --- Inventory Aging (FIFO) helpers ---
const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

function getAgingBucket(ageDays) {
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
}

/** Bucket-based discount suggestion: 0–30 → 0%, 31–60 → 5%, 61–90 → 10%, 90+ → 20% */
function getBucketDiscountPercent(bucket) {
  switch (bucket) {
    case '0-30': return 0;
    case '31-60': return 5;
    case '61-90': return 10;
    case '90+': return 20;
    default: return 0;
  }
}

/**
 * Compute suggested discount and price. Cap by max_discount_percent and by cost floor.
 * Returns { suggestedDiscountPercent, suggestedPrice, discountCappedByCost }.
 */
function getDiscountSuggestion(bucket, defaultSellingPrice, maxDiscountPercent, costPrice) {
  const bucketPct = getBucketDiscountPercent(bucket);
  const maxPct = Number.isFinite(maxDiscountPercent) ? maxDiscountPercent : 0;
  const suggestedDiscountPercent = Math.min(bucketPct, maxPct);
  const sellingPrice = Number.isFinite(defaultSellingPrice) ? defaultSellingPrice : 0;
  let suggestedPrice = sellingPrice > 0
    ? Math.round(sellingPrice * (1 - suggestedDiscountPercent / 100) * 100) / 100
    : costPrice;
  let discountCappedByCost = false;
  if (Number.isFinite(costPrice) && suggestedPrice < costPrice) {
    suggestedPrice = Math.round(costPrice * 100) / 100;
    discountCappedByCost = true;
  }
  return { suggestedDiscountPercent, suggestedPrice, discountCappedByCost };
}

function daysBetween(asOfDate, purchasedAt) {
  const a = new Date(asOfDate);
  const p = new Date(purchasedAt);
  a.setHours(0, 0, 0, 0);
  p.setHours(0, 0, 0, 0);
  return Math.floor((a - p) / (24 * 60 * 60 * 1000));
}

/**
 * FIFO: consume totalSold from layers (oldest first). Return remaining layers with { purchasedAt, quantity, effectiveUnitCost }.
 */
function applyFifo(layers, totalSold) {
  let toConsume = totalSold;
  const remaining = [];
  for (const layer of layers) {
    const qty = layer.quantity;
    const consume = Math.min(qty, toConsume);
    toConsume -= consume;
    const remainingQty = qty - consume;
    if (remainingQty > 0) {
      remaining.push({
        purchasedAt: layer.purchasedAt,
        quantity: remainingQty,
        effectiveUnitCost: layer.effectiveUnitCost,
      });
    }
  }
  return remaining;
}

/**
 * GET /reports/inventory-aging?asOfDate=YYYY-MM-DD&categoryId=...
 * Inventory aging report using FIFO. Remaining stock is aged by purchase date and bucketed.
 */
export async function getInventoryAging(req, res) {
  try {
    const asOfStr = req.query.asOfDate;
    const categoryId = req.query.categoryId?.trim() || null;
    const asOfDate = asOfStr && /^\d{4}-\d{2}-\d{2}$/.test(asOfStr)
      ? new Date(asOfStr + 'T00:00:00.000Z')
      : new Date();
    const asOfDateOnly = asOfStr && /^\d{4}-\d{2}-\d{2}$/.test(asOfStr) ? asOfStr : asOfDate.toISOString().slice(0, 10);

    const variantWhere = categoryId ? { categoryId } : {};
    const variants = await prisma.productVariant.findMany({
      where: variantWhere,
      include: { products: { take: 1 } },
    });
    const variantIds = variants.map((v) => v.id);
    const skuByVariant = Object.fromEntries(variants.map((v) => [v.id, v.products[0]?.sku ?? '—']));
    const variantPricing = Object.fromEntries(
      variants.map((v) => [
        v.id,
        {
          default_selling_price: v.default_selling_price,
          max_discount_percent: v.max_discount_percent,
        },
      ])
    );

    if (variantIds.length === 0) {
      return res.json({
        asOfDate: asOfDateOnly,
        buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, { quantity: 0, value: 0 }])),
        items: [],
      });
    }

    const saleItems = await prisma.saleItem.findMany({
      include: { product: true },
      where: { product: { productVariantId: { in: variantIds } } },
    });
    const soldByVariant = {};
    for (const si of saleItems) {
      const vid = si.product?.productVariantId;
      if (!vid) continue;
      soldByVariant[vid] = (soldByVariant[vid] || 0) + si.quantity;
    }

    const purchaseItems = await prisma.purchaseItem.findMany({
      where: { productVariantId: { in: variantIds } },
      include: { purchase: true },
    });
    const layersByVariant = {};
    for (const pi of purchaseItems) {
      const vid = pi.productVariantId;
      if (!layersByVariant[vid]) layersByVariant[vid] = [];
      layersByVariant[vid].push({
        purchasedAt: pi.purchase.purchasedAt,
        quantity: pi.quantity,
        effectiveUnitCost: Number(pi.effectiveUnitCost),
      });
    }
    for (const vid of Object.keys(layersByVariant)) {
      layersByVariant[vid].sort((a, b) => new Date(a.purchasedAt) - new Date(b.purchasedAt));
    }

    const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b, { quantity: 0, value: 0 }]));
    const items = [];

    for (const variantId of variantIds) {
      const layers = layersByVariant[variantId] || [];
      const totalSold = soldByVariant[variantId] || 0;
      const remainingLayers = applyFifo(layers, totalSold);
      const sku = skuByVariant[variantId] ?? '—';

      const pricing = variantPricing[variantId] || {};
      const defaultSellingPrice = pricing.default_selling_price;
      const maxDiscountPercent = pricing.max_discount_percent;

      for (const layer of remainingLayers) {
        const ageDays = daysBetween(asOfDate, layer.purchasedAt);
        const bucket = getAgingBucket(ageDays);
        const value = Math.round(layer.quantity * layer.effectiveUnitCost * 100) / 100;

        const { suggestedDiscountPercent, suggestedPrice, discountCappedByCost } =
          getDiscountSuggestion(
            bucket,
            defaultSellingPrice,
            maxDiscountPercent,
            layer.effectiveUnitCost
          );

        items.push({
          sku,
          productName: sku,
          ageDays,
          bucket,
          quantity: layer.quantity,
          value,
          suggestedDiscountPercent,
          suggestedPrice,
          discountCappedByCost,
        });

        buckets[bucket].quantity += layer.quantity;
        buckets[bucket].value = Math.round((buckets[bucket].value + value) * 100) / 100;
      }
    }

    for (const b of AGING_BUCKETS) {
      buckets[b].value = Math.round(buckets[b].value * 100) / 100;
    }

    res.json({
      asOfDate: asOfDateOnly,
      buckets,
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
