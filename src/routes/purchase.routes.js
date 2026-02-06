import { Router } from 'express';
import { postPurchase } from '../controllers/purchase.controller.js';

const router = Router();
router.post('/', postPurchase);

export default router;
