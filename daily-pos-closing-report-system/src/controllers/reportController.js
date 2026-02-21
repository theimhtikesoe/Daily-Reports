const dayjs = require('dayjs');
const { query } = require('../config/db');
const { fetchSalesSummaryByDate } = require('../services/loyverseService');
const { calculateReportValues, toNumber } = require('../utils/calculations');

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return false;
  }

  const parsed = dayjs(`${date}T00:00:00`);
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === date;
}

function validateDateOrThrow(date) {
  if (!date || !isValidDate(date)) {
    const error = new Error('Invalid date format. Use YYYY-MM-DD.');
    error.status = 400;
    throw error;
  }
}

async function syncFromLoyverse(req, res, next) {
  try {
    const { date } = req.query;
    validateDateOrThrow(date);

    const summary = await fetchSalesSummaryByDate(date);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

async function getReportByDate(req, res, next) {
  try {
    const { date } = req.params;
    validateDateOrThrow(date);

    const rows = await query('SELECT * FROM daily_reports WHERE date = ?', [date]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Report not found for this date' });
    }

    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function upsertReport(req, res, next) {
  try {
    const payload = req.body || {};
    validateDateOrThrow(payload.date);

    const totalOrders = Number.isInteger(Number(payload.total_orders)) ? Number(payload.total_orders) : 0;
    if (totalOrders < 0) {
      const error = new Error('total_orders cannot be negative');
      error.status = 400;
      throw error;
    }

    const reportValues = calculateReportValues(payload);
    const tip = toNumber(payload.tip);

    await query(
      `INSERT INTO daily_reports (
        date,
        net_sale,
        cash_total,
        card_total,
        total_orders,
        expense,
        tip,
        opening_cash,
        actual_cash_counted,
        expected_cash,
        difference
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        net_sale = VALUES(net_sale),
        cash_total = VALUES(cash_total),
        card_total = VALUES(card_total),
        total_orders = VALUES(total_orders),
        expense = VALUES(expense),
        tip = VALUES(tip),
        opening_cash = VALUES(opening_cash),
        actual_cash_counted = VALUES(actual_cash_counted),
        expected_cash = VALUES(expected_cash),
        difference = VALUES(difference),
        updated_at = CURRENT_TIMESTAMP`,
      [
        payload.date,
        reportValues.net_sale,
        reportValues.cash_total,
        reportValues.card_total,
        totalOrders,
        reportValues.expense,
        tip,
        reportValues.opening_cash,
        reportValues.actual_cash_counted,
        reportValues.expected_cash,
        reportValues.difference
      ]
    );

    const savedRows = await query('SELECT * FROM daily_reports WHERE date = ?', [payload.date]);
    return res.status(201).json(savedRows[0]);
  } catch (error) {
    return next(error);
  }
}

async function listReports(req, res, next) {
  try {
    const { from, to } = req.query;
    const requestedLimit = Number(req.query.limit || 100);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 500)
        : 100;

    const conditions = [];
    const params = [];

    if (from) {
      validateDateOrThrow(from);
      conditions.push('date >= ?');
      params.push(from);
    }

    if (to) {
      validateDateOrThrow(to);
      conditions.push('date <= ?');
      params.push(to);
    }

    let sql = 'SELECT * FROM daily_reports';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY date DESC LIMIT ?';
    params.push(limit);

    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getLast7DayNetSales(req, res, next) {
  try {
    const rows = await query(
      `SELECT date, net_sale
       FROM daily_reports
       ORDER BY date DESC
       LIMIT 7`
    );

    return res.json(rows.reverse());
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales
};
