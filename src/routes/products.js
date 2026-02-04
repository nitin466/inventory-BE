import { Router } from 'express';
import { postProduct } from '../controllers/product.controller.js';

const router = Router();
router.post('/', postProduct);

export default router;
