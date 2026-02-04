const ALLOWED_KEYS = ['products', 'variants', 'suppliers', 'sales'];

function validatePayloadShape(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, message: 'Payload must be a JSON object' };
  }
  const keys = Object.keys(body);
  const invalid = keys.filter((k) => !ALLOWED_KEYS.includes(k));
  if (invalid.length) {
    return { valid: false, message: `Unknown keys: ${invalid.join(', ')}` };
  }
  for (const key of ALLOWED_KEYS) {
    if (key in body && !Array.isArray(body[key])) {
      return { valid: false, message: `${key} must be an array` };
    }
  }
  return { valid: true };
}

export async function postSync(req, res) {
  const validation = validatePayloadShape(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const body = req.body;
  const counts = {
    products: (body.products ?? []).length,
    variants: (body.variants ?? []).length,
    suppliers: (body.suppliers ?? []).length,
    sales: (body.sales ?? []).length,
  };

  // TODO: persist to DB
  res.status(200).json(counts);
}
