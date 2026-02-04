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

