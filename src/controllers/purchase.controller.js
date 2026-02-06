import { createPurchase } from '../services/purchase.service.js';

export async function postPurchase(req, res) {
  try {
    const result = await createPurchase(req.body);
    res.status(201).json({ purchaseId: result.purchaseId });
  } catch (err) {
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  }
}
