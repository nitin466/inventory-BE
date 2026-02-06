import { Router } from 'express';
import {
  getDailySales,
  getInventorySnapshot,
  getSalesList,
  getSalesSummary,
  getSalesProfit,
  getInventoryValuation,
  getInventoryAging,
} from '../controllers/reports.controller.js';

const router = Router();
router.get('/sales-summary', getSalesSummary);
router.get('/daily-sales', getDailySales);
router.get('/inventory', getInventorySnapshot);
router.get('/inventory-valuation', getInventoryValuation);
router.get('/inventory-aging', getInventoryAging);
router.get('/sales-list', getSalesList);
router.get('/sales-profit', getSalesProfit);

export default router;
