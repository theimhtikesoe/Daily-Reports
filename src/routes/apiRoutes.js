const express = require('express');
const {
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales,
  getReportsSummary
} = require('../controllers/reportController');

const router = express.Router();

router.get('/loyverse/sync', syncFromLoyverse);

router.get('/loyverse/debug-items', async (req, res) => {
  try {
    const axios = require('axios');
    const token = process.env.LOYVERSE_API_TOKEN;
    const response = await axios.get('https://api.loyverse.com/v1.0/items', {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 3 }
    });
    const items = response.data?.items || [];
    res.json({ count: items.length, sample: items.slice(0, 2) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reports/last-7/net-sales', getLast7DayNetSales);
router.get('/reports/summary', getReportsSummary);
router.get('/reports', listReports);
router.get('/reports/:date', getReportByDate);
router.post('/reports', upsertReport);

module.exports = router;
