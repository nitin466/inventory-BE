import prisma from '../lib/prisma.js';

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/**
 * Create a purchase with items. Allocate extraCharges proportionally by quantity.
 * Increment Product.quantityInStock for each item (product matched by productVariantId + supplierId).
 * All in one Prisma transaction. Returns { purchaseId }.
 */
export async function createPurchase(payload) {
  const {
    supplierId,
    purchasedAt,
    invoiceNo,
    notes,
    extraCharges = 0,
    items = [],
  } = payload ?? {};

  // ---- Input validation ----
  if (!supplierId || typeof supplierId !== 'string' || !supplierId.trim()) {
    throw err('supplierId is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw err('items must be a non-empty array');
  }

  const extraNum = Number(extraCharges);
  if (!Number.isFinite(extraNum) || extraNum < 0) {
    throw err('extraCharges must be a non-negative number');
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it?.productVariantId) throw err(`items[${i}]: productVariantId is required`);
    const qty = Number(it.quantity);
    const cost = Number(it.unitCost);
    if (!Number.isInteger(qty) || qty < 1) throw err(`items[${i}]: quantity must be a positive integer`);
    if (!Number.isFinite(cost) || cost < 0) throw err(`items[${i}]: unitCost must be a non-negative number`);
  }

  const totalQty = items.reduce((sum, i) => sum + Number(i.quantity), 0);
  if (totalQty <= 0) throw err('Total quantity must be positive');

  return prisma.$transaction(async (tx) => {
    // Validate supplier exists
    const supplier = await tx.supplier.findUnique({
      where: { id: supplierId.trim() },
    });
    if (!supplier) throw err('Supplier not found', 404);

    const variantIds = [...new Set(items.map((i) => i.productVariantId?.trim()).filter(Boolean))];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
    });
    const variantSet = new Set(variants.map((v) => v.id));
    for (const id of variantIds) {
      if (!variantSet.has(id)) throw err(`ProductVariant not found: ${id}`, 404);
    }

    const purchasedAtDate = purchasedAt ? new Date(purchasedAt) : new Date();
    if (Number.isNaN(purchasedAtDate.getTime())) throw err('purchasedAt must be a valid date');

    // Create Purchase
    const purchase = await tx.purchase.create({
      data: {
        supplierId: supplier.id,
        purchasedAt: purchasedAtDate,
        invoiceNo: invoiceNo != null ? String(invoiceNo).trim() || null : null,
        notes: notes != null ? String(notes).trim() || null : null,
        extraCharges: extraNum || null,
      },
    });

    const extraChargesVal = extraNum || 0;

    for (const it of items) {
      const productVariantId = it.productVariantId.trim();
      const quantity = Number(it.quantity);
      const unitCost = Number(it.unitCost);

      const allocatedCharge = totalQty > 0 ? (quantity / totalQty) * extraChargesVal : 0;
      const effectiveUnitCost = quantity > 0
        ? (unitCost * quantity + allocatedCharge) / quantity
        : unitCost;
      const effectiveRounded = Math.round(effectiveUnitCost * 100) / 100;

      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productVariantId,
          quantity,
          unitCost,
          effectiveUnitCost: effectiveRounded,
        },
      });

      // Increment Product.quantityInStock for product(s) with this variant and this supplier
      const updated = await tx.product.updateMany({
        where: {
          productVariantId,
          supplierId: supplier.id,
        },
        data: {
          quantityInStock: { increment: quantity },
        },
      });
      if (updated.count === 0) {
        throw err(
          `No product found for variant ${productVariantId} from supplier ${supplier.id}. Create a product (SKU) for this variant and supplier first.`,
          400
        );
      }
    }

    return { purchaseId: purchase.id };
  });
}
