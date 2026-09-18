const assert = require('assert');
const { classifyItem } = require('../src/services/itemClassifier');
const { buildAutomatedReportRows } = require('../src/services/loyverseService');

assert.strictEqual(classifyItem('Rozay Cake', 'Food & Drink', 1500), 'main');
assert.strictEqual(classifyItem('Chocolate Cake', 'Food & Drink', 120), 'fb');
assert.strictEqual(classifyItem('Water', 'Food & Drink', 60), 'fb');

const report = buildAutomatedReportRows([
  {
    receipt_number: 'TEST-ROZAY-1',
    receipt_date: '2026-09-19T03:00:00+07:00',
    line_items: [
      {
        name: 'Rozay Cake',
        category_name: 'Food & Drink',
        quantity: 1,
        gross_total_money: { amount: 1500 },
        total_money: { amount: 1500 }
      },
      {
        name: 'Chocolate Cake',
        category_name: 'Food & Drink',
        quantity: 1,
        gross_total_money: { amount: 120 },
        total_money: { amount: 120 }
      }
    ]
  }
]);

assert.strictEqual(report.rows[0].gram_qty, 1, 'Rozay Cake must count as flower grams');
assert.strictEqual(report.rows[0].numerator_price, 1500, 'Rozay Cake must count in Main/Flower sales');
assert.strictEqual(report.rows[0].denominator_price, 120, 'Ordinary cake must remain F&B');
assert.strictEqual(report.totals.total_gram_qty, 1);
assert.strictEqual(report.totals.total_numerator_price, 1500);
assert.strictEqual(report.totals.total_denominator_price, 120);

console.log('Rozay Cake regression tests passed.');
