import { Router } from 'express';
import { postProduct, getBySku } from '../controllers/product.controller.js';

const router = Router();
router.get('/by-sku/:sku', getBySku);
router.post('/', postProduct);

export default router;
