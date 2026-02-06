import prisma from '../lib/prisma.js';

const PAYMENT_SUM_TOLERANCE = 1; // allow 1 cent rounding

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

/**
 * Validate items and payments, resolve products by SKU, check stock and discount rules.
 * Returns { productsBySku, lineTotals, totalAmount } or throws.
 */
async function validateAndCompute(tx, items, payments) {
  if (!Array.isArray(items) || items.length === 0) {
    throw err('items must be a non-empty array');
  }
  if (!Array.isArray(payments) || payments.length === 0) {
    throw err('payments must be a non-empty array');
  }

  const skus = [...new Set(items.map((i) => i?.sku).filter(Boolean))];
  const products = await tx.product.findMany({
    where: { sku: { in: skus } },
    include: { productVariant: true },
  });
  const productsBySku = Object.fromEntries(products.map((p) => [p.sku, p]));

  // 1. Validate all SKUs exist
  for (const it of items) {
    const sku = it?.sku;
    if (!sku) throw err('Each item must have sku');
    if (!productsBySku[sku]) {
      throw err(`Product not found for SKU: ${sku}`);
    }
  }

  const lineTotals = [];
  let totalAmount = 0;

  for (const it of items) {
    const product = productsBySku[it.sku];
    const quantity = Number(it.quantity);
    const sellingPrice = Number(it.sellingPrice);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw err(`Invalid quantity for SKU ${it.sku}`);
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      throw err(`Invalid sellingPrice for SKU ${it.sku}`);
    }

    // 2. Validate stock
    if (product.quantityInStock < quantity) {
      throw err(
        `Insufficient stock for SKU ${it.sku}: requested ${quantity}, available ${product.quantityInStock}`
      );
    }

    // 3. Validate discount rules (sellingPrice <= mrp, discount % <= max_discount_percent)
    const mrp = product.productVariant?.mrp;
    const maxDiscountPercent = product.productVariant?.max_discount_percent ?? 0;

    if (mrp != null && Number.isFinite(mrp)) {
      if (sellingPrice > mrp) {
        throw err(
          `Selling price for SKU ${it.sku} (${sellingPrice}) exceeds MRP (${mrp})`
        );
      }
      if (mrp > 0 && maxDiscountPercent != null && Number.isFinite(maxDiscountPercent)) {
        const discountPercent = ((mrp - sellingPrice) / mrp) * 100;
        if (discountPercent > maxDiscountPercent) {
          throw err(
            `Discount for SKU ${it.sku} (${discountPercent.toFixed(1)}%) exceeds max allowed (${maxDiscountPercent}%)`
          );
        }
      }
    }

    // 4 & 5. Calculate lineTotal and accumulate totalAmount
    const lineTotal = Math.round(quantity * sellingPrice * 100) / 100;
    lineTotals.push({
      product,
      quantity,
      unitPrice: sellingPrice,
      lineTotal,
    });
    totalAmount += lineTotal;
  }
  totalAmount = Math.round(totalAmount * 100) / 100;

  // 6. Validate sum(payments.amount) === totalAmount
  let paymentSum = 0;
  const normalizedPayments = [];
  for (const p of payments) {
    const mode = p?.mode;
    const amount = Number(p?.amount);
    if (!mode || typeof mode !== 'string') throw err('Each payment must have mode');
    if (!Number.isFinite(amount) || amount < 0) throw err('Each payment must have a valid amount');
    paymentSum += amount;
    normalizedPayments.push({
      mode: String(mode).trim(),
      provider: p?.provider != null ? String(p.provider).trim() : null,
      amount,
    });
  }
  paymentSum = Math.round(paymentSum * 100) / 100;
  if (Math.abs(paymentSum - totalAmount) > PAYMENT_SUM_TOLERANCE) {
    throw err(
      `Payment total (${paymentSum}) does not match sale total (${totalAmount})`
    );
  }

  return { lineTotals, normalizedPayments, totalAmount };
}

/**
 * Create a sale with items and payments.
 * Input: { items: [{ sku, quantity, sellingPrice }], payments: [{ mode, provider?, amount }] }
 * All steps run inside a Prisma transaction.
 */
export async function createSale(payload) {
  const { items = [], payments = [] } = payload ?? {};

  return prisma.$transaction(async (tx) => {
    const { lineTotals, normalizedPayments, totalAmount } = await validateAndCompute(
      tx,
      items,
      payments
    );

    // 7. Generate next bill number for today (BILL-YYYYMMDD-NNNN) and create Sale
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `BILL-${yyyy}${mm}${dd}-`;

    const lastSale = await tx.sale.findFirst({
      where: { billNumber: { startsWith: prefix } },
      orderBy: { billNumber: 'desc' },
      select: { billNumber: true },
    });

    let seq = 1;
    if (lastSale?.billNumber) {
      const numPart = lastSale.billNumber.slice(prefix.length);
      const n = parseInt(numPart, 10);
      if (Number.isFinite(n) && n >= 0) seq = n + 1;
    }
    const billNumber = prefix + String(seq).padStart(4, '0');

    const sale = await tx.sale.create({
      data: {
        billNumber,
        totalAmount,
        soldAt: now,
      },
    });

    // 8. Create SaleItem records
    for (const row of lineTotals) {
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: row.product.id,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal,
        },
      });
    }

    // 9. Reduce Product.quantityInStock for each item
    for (const row of lineTotals) {
      await tx.product.update({
        where: { id: row.product.id },
        data: {
          quantityInStock: { decrement: row.quantity },
        },
      });
    }

    // 10. Create Payment records
    for (const p of normalizedPayments) {
      await tx.payment.create({
        data: {
          saleId: sale.id,
          mode: p.mode,
          provider: p.provider,
          amount: p.amount,
        },
      });
    }

    return {
      saleId: sale.id,
      billNumber: sale.billNumber ?? null,
      totalAmount,
      soldAt: sale.soldAt,
    };
  });
}
