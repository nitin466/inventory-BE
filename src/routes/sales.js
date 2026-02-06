import { Router } from 'express';
import { postSale } from '../controllers/sale.controller.js';

const router = Router();
router.post('/', postSale);

export default router;
