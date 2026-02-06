import { createSale } from '../services/sale.service.js';

export async function postSale(req, res) {
  try {
    const result = await createSale(req.body);
    res.status(201).json({
      saleId: result.saleId,
      billNumber: result.billNumber,
      totalAmount: result.totalAmount,
    });
  } catch (err) {
    const status = err.statusCode === 400 ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
}
