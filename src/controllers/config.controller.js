import prisma from '../lib/prisma.js';

export async function getCategories(req, res) {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { subcategories: { orderBy: { name: 'asc' } } },
  });
  res.json(categories);
}

export async function getAttributes(req, res) {
  const { categoryId } = req.query;

  const where = categoryId
    ? { categoryId }
    : {};

  const attributes = await prisma.attributeDefinition.findMany({
    where,
    orderBy: { key: 'asc' },
    select: {
      id: true,
      name: true,
      key: true,
      dataType: true,
      required: true,
      analyticsEnabled: true,
      enumValues: true,
    },
  });

  res.json(attributes);
}

export async function getSuppliers(req, res) {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  res.json(suppliers);
}

export async function getProductVariants(req, res) {
  const variants = await prisma.productVariant.findMany({
    orderBy: { id: 'asc' },
    include: {
      products: { take: 1, select: { sku: true } },
      category: { select: { name: true } },
    },
  });
  const list = variants.map((v) => ({
    id: v.id,
    label: v.products?.[0]?.sku ?? v.category?.name ?? v.id,
  }));
  res.json(list);
}

