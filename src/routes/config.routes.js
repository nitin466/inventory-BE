import { Router } from 'express';
import { getCategories, getAttributes, getSuppliers, getProductVariants } from '../controllers/config.controller.js';

const router = Router();
router.get('/categories', getCategories);
router.get('/attributes', getAttributes);
router.get('/suppliers', getSuppliers);
router.get('/product-variants', getProductVariants);


export default router;
