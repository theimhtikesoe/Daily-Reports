const cron = require('node-cron');
const dayjs = require('dayjs');
const { query, getDialect } = require('../config/db');
const { fetchSalesSummaryByDate } = require('../services/loyverseService');
const { calculateReportValues, toNumber } = require('../utils/calculations');

const isPostgres = getDialect() === 'postgres';

function placeholder(index) {
  return isPostgres ? `$${index}` : '?';
}

function isAutoSyncEnabled() {
  return String(process.env.AUTO_SYNC_ENABLED || 'false').toLowerCase() === 'true';
}

async function runDailySync() {
  const today = dayjs().format('YYYY-MM-DD');
  const sales = await fetchSalesSummaryByDate(today);

  const existing = await query(`SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`, [today]);
  const existingReport = existing[0] || {};

  const calculated = calculateReportValues({
    opening_cash: toNumber(existingReport.opening_cash),
    cash_total: sales.cash_total,
    card_total: sales.card_total,
    expense: toNumber(existingReport.expense),
    actual_cash_counted: toNumber(existingReport.actual_cash_counted)
  });

  const values = [
    today,
    calculated.net_sale,
    calculated.cash_total,
    calculated.card_total,
    sales.total_orders,
    toNumber(existingReport.expense),
    toNumber(existingReport.tip),
    toNumber(existingReport.opening_cash),
    toNumber(existingReport.actual_cash_counted),
    calculated.expected_cash,
    calculated.difference
  ];

  if (isPostgres) {
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
      ) VALUES (${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)}, ${placeholder(6)}, ${placeholder(7)}, ${placeholder(8)}, ${placeholder(9)}, ${placeholder(10)}, ${placeholder(11)})
      ON CONFLICT (date) DO UPDATE SET
        net_sale = EXCLUDED.net_sale,
        cash_total = EXCLUDED.cash_total,
        card_total = EXCLUDED.card_total,
        total_orders = EXCLUDED.total_orders,
        expense = EXCLUDED.expense,
        tip = EXCLUDED.tip,
        opening_cash = EXCLUDED.opening_cash,
        actual_cash_counted = EXCLUDED.actual_cash_counted,
        expected_cash = EXCLUDED.expected_cash,
        difference = EXCLUDED.difference,
        updated_at = CURRENT_TIMESTAMP`,
      values
    );
    return;
  }

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
    values
  );
}

function scheduleDailySyncJob() {
  if (!isAutoSyncEnabled()) {
    return null;
  }

  const cronExpression = process.env.AUTO_SYNC_TIME || '59 23 * * *';

  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid AUTO_SYNC_TIME cron expression: ${cronExpression}`);
  }

  const task = cron.schedule(cronExpression, async () => {
    try {
      await runDailySync();
      console.log('[Cron] Daily sync completed successfully');
    } catch (error) {
      console.error('[Cron] Daily sync failed:', error.message);
    }
  });

  console.log(`[Cron] Daily sync scheduled with expression: ${cronExpression}`);
  return task;
}

module.exports = {
  scheduleDailySyncJob,
  runDailySync
};
