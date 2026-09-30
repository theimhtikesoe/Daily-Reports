const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { classifyItem } = require('../src/services/itemClassifier');
const { buildAutomatedReportRows } = require('../src/services/loyverseService');

const noop = () => {};
const browserContext = {
  window: {},
  document: {
    addEventListener: noop,
    getElementById: () => null,
    querySelectorAll: () => [],
    createElement: () => ({})
  },
  console,
  setTimeout,
  clearTimeout,
  URL,
  Blob,
  fetch: () => Promise.resolve(),
  EventSource: function EventSource() {}
};
vm.createContext(browserContext);
vm.runInContext(
  fs.readFileSync(require.resolve('../public/enhancements.js'), 'utf8'),
  browserContext
);
const processItemsForExcel = browserContext.processItemsForExcel;

assert.strictEqual(classifyItem('Rozay Cake', 'Food & Drink', 1500), 'main');
assert.strictEqual(classifyItem('Chocolate Cake', 'Food & Drink', 120), 'fb');
assert.strictEqual(classifyItem('Water', 'Food & Drink', 60), 'fb');
assert.strictEqual(classifyItem('Bileaf', '', 1500), 'accessory');

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

const clientExport = processItemsForExcel([
  {
    receipt_number: 'TEST-ROZAY-EXPORT-1',
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

assert.strictEqual(clientExport.flowerItems.length, 1, 'Excel export must put Rozay Cake in Flower/Main');
assert.strictEqual(clientExport.flowerItems[0].name, 'Rozay Cake');
assert.strictEqual(clientExport.flowerItems[0].gram, '1.000 G');
assert.strictEqual(clientExport.fbItems.length, 1, 'Excel export must keep ordinary cake in F&B');
assert.strictEqual(clientExport.fbItems[0].name, 'Chocolate Cake');
assert.strictEqual(clientExport.totalFlowerGrams, 1);

const lowPriceGelonade = processItemsForExcel([
  {
    receipt_number: 'TEST-GELONADE-EXPORT-1',
    line_items: [{
      name: 'Gelonade',
      category_name: 'Flower',
      quantity: 1,
      gross_total_money: { amount: 40 },
      total_money: { amount: 40 }
    }]
  }
]);
assert.strictEqual(lowPriceGelonade.flowerItems[0].name, 'Gelonade', 'Excel export must keep Gelonade in Flower/Main');
assert.strictEqual(lowPriceGelonade.fbItems.length, 0, 'Gelonade must not be routed to F&B by price fallback');

console.log('Rozay Cake regression tests passed.');
