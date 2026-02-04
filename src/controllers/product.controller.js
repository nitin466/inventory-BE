import { createProduct } from '../services/product.service.js';

export async function postProduct(req, res) {
  try {
    const result = await createProduct(req.body);
    res.status(201).json(result);
  } catch (err) {
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  }
}
