import { Router } from 'express';
import { getCategories, getAttributes, getSuppliers } from '../controllers/config.controller.js';

const router = Router();
router.get('/categories', getCategories);
router.get('/attributes', getAttributes);
router.get("/suppliers", getSuppliers);


export default router;
