const express = require('express');
const {
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales
} = require('../controllers/reportController');

const router = express.Router();

router.get('/loyverse/sync', syncFromLoyverse);

router.get('/reports/last-7/net-sales', getLast7DayNetSales);
router.get('/reports', listReports);
router.get('/reports/:date', getReportByDate);
router.post('/reports', upsertReport);

module.exports = router;
