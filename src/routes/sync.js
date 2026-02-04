import { Router } from 'express';
import { postSync } from '../controllers/sync.controller.js';

const router = Router();
router.post('/', postSync);

export default router;
