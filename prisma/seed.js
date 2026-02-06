import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1️⃣ Categories
  const sareeCategory = await prisma.category.upsert({
    where: { id: 'CAT-SAREE' },
    update: {},
    create: {
      id: 'CAT-SAREE',
      name: 'Saree',
      slug: 'saree',
    },
  });

  const shawlCategory = await prisma.category.upsert({
    where: { id: 'CAT-SHAWL' },
    update: {},
    create: {
      id: 'CAT-SHAWL',
      name: 'Shawl',
      slug: 'shawl',
    },
  });

  // 2️⃣ Subcategories
  const subSarees = await prisma.subcategory.upsert({
    where: { slug: 'sarees' },
    update: {},
    create: {
      name: 'Sarees',
      slug: 'sarees',
      categoryId: sareeCategory.id,
    },
  });
  await prisma.subcategory.upsert({
    where: { slug: 'stoles' },
    update: {},
    create: {
      name: 'Stoles',
      slug: 'stoles',
      categoryId: shawlCategory.id,
    },
  });

  // 3️⃣ Attribute Definitions
  await prisma.attributeDefinition.createMany({
    data: [
      {
        id: 'ATTR-COLOR',
        categoryId: sareeCategory.id,
        name: 'Color',
        key: 'color',
        dataType: 'string',
        required: true,
        analyticsEnabled: true,
      },
      {
        id: 'ATTR-ORIGIN',
        categoryId: sareeCategory.id,
        name: 'Origin',
        key: 'origin',
        dataType: 'string',
        required: false,
        analyticsEnabled: true,
      },
    ],
    skipDuplicates: true,
  });

  // 4️⃣ Suppliers
  const supplier = await prisma.supplier.upsert({
    where: { code: 'SUP-01' },
    update: {},
    create: {
      name: 'Puneet Textiles',
      code: 'SUP-01',
    },
  });

  // 5️⃣ Product Variant
  const variant = await prisma.productVariant.upsert({
    where: { id: 'VAR-SAREE-RED' },
    update: {},
    create: {
      id: 'VAR-SAREE-RED',
      categoryId: sareeCategory.id,
      subcategoryId: subSarees.id,
      attributes_json: {
        color: 'Red',
        origin: 'Banaras',
      },
      mrp: 2500,
      default_selling_price: 2200,
      max_discount_percent: 20,
    },
  });

  // 6️⃣ Product (actual stock)
  const product = await prisma.product.upsert({
    where: { sku: 'saree-red-ban-0001' },
    update: {},
    create: {
      sku: 'saree-red-ban-0001',
      productVariantId: variant.id,
      supplierId: supplier.id,
      quantityInStock: 10,
    },
  });

  // 7️⃣ Sale
  const sale = await prisma.sale.create({
    data: {
      billNumber: '20260205-0001',
      totalAmount: 2200,
      soldAt: new Date(),
    },
  });

  // 8️⃣ SaleItems
  await prisma.saleItem.create({
    data: {
      saleId: sale.id,
      productId: product.id,
      quantity: 1,
      unitPrice: 2200,
      lineTotal: 2200,
    },
  });

  // 9️⃣ Payments
  await prisma.payment.createMany({
    data: [
      { saleId: sale.id, mode: 'CASH', amount: 1200 },
      { saleId: sale.id, mode: 'UPI', provider: 'GPay', amount: 1000 },
    ],
  });

  // Reduce product stock to reflect the sale
  await prisma.product.update({
    where: { id: product.id },
    data: { quantityInStock: 9 },
  });

  console.log('✅ Seeding completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
