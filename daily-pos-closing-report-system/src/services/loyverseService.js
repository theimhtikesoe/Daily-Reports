const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { calculateNetSale, normalizeMoney, roundCurrency } = require('../utils/calculations');

dayjs.extend(utc);
dayjs.extend(timezone);

const loyverseClient = axios.create({
  baseURL: process.env.LOYVERSE_API_BASE_URL || 'https://api.loyverse.com/v1.0',
  timeout: 30000
});

function getHeaders() {
  const token = process.env.LOYVERSE_API_TOKEN;
  if (!token) {
    throw new Error('LOYVERSE_API_TOKEN is not configured');
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

function getDateBounds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const parsed = dayjs(`${date}T00:00:00`);
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== date) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const tz = process.env.LOYVERSE_TIMEZONE || 'Asia/Bangkok';
  const startLocal = dayjs.tz(`${date} 00:00:00.000`, tz);
  const endLocal = dayjs.tz(`${date} 23:59:59.999`, tz);

  return {
    startIso: startLocal.toISOString(),
    endIso: endLocal.toISOString()
  };
}

async function fetchPaymentTypeMap() {
  try {
    const response = await loyverseClient.get('/payment_types', {
      headers: getHeaders()
    });

    const paymentTypes =
      response.data?.payment_types ||
      response.data?.items ||
      response.data?.data ||
      [];

    const map = new Map();
    for (const type of paymentTypes) {
      const id = type.id || type.payment_type_id;
      if (!id) {
        continue;
      }
      map.set(id, {
        name: type.name || type.payment_type || '',
        type: type.type || ''
      });
    }

    return map;
  } catch (error) {
    return new Map();
  }
}

async function fetchClosedReceiptsByDate(date) {
  const { startIso, endIso } = getDateBounds(date);

  const receipts = [];
  let cursor;
  let pages = 0;

  do {
    const params = {
      created_at_min: startIso,
      created_at_max: endIso,
      status: 'CLOSED',
      limit: 250
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const response = await loyverseClient.get('/receipts', {
      headers: getHeaders(),
      params
    });

    const payload = response.data || {};
    const pageReceipts = payload.receipts || payload.items || payload.data || [];
    receipts.push(...pageReceipts);

    const nextCursor = payload.cursor || payload.next_cursor || payload.nextCursor || null;
    cursor = nextCursor && nextCursor !== cursor ? nextCursor : null;
    pages += 1;

    if (pages > 100) {
      throw new Error('Loyverse pagination limit exceeded while fetching receipts');
    }
  } while (cursor);

  return receipts;
}

function classifyPaymentType(paymentTypeText) {
  const normalized = String(paymentTypeText || '').toUpperCase();

  if (normalized.includes('CASH')) {
    return 'cash';
  }

  if (
    normalized.includes('CARD') ||
    normalized.includes('CREDIT') ||
    normalized.includes('DEBIT') ||
    normalized.includes('VISA') ||
    normalized.includes('MASTER')
  ) {
    return 'card';
  }

  return 'other';
}

function hasRefundData(receipt) {
  const refundedFlags = [
    receipt.is_refunded,
    receipt.refunded,
    receipt.is_returned
  ];
  if (refundedFlags.some((flag) => flag === true)) {
    return true;
  }

  if (receipt.refunded_at || receipt.returned_at) {
    return true;
  }

  const refundCollections = [
    receipt.refunds,
    receipt.refund_items,
    receipt.returns
  ];

  return refundCollections.some((collection) => Array.isArray(collection) && collection.length > 0);
}

function isVoidedReceipt(receipt) {
  const status = String(receipt.status || '').toUpperCase();
  const voidStatuses = new Set(['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'DELETED']);

  return (
    voidStatuses.has(status) ||
    receipt.voided_at ||
    receipt.cancelled_at ||
    receipt.canceled_at ||
    receipt.deleted_at ||
    receipt.is_voided === true
  );
}

function isCompletedReceipt(receipt) {
  if (isVoidedReceipt(receipt) || hasRefundData(receipt)) {
    return false;
  }

  const status = String(receipt.status || '').toUpperCase();
  const completedStatuses = new Set(['', 'CLOSED', 'COMPLETED', 'PAID']);
  return completedStatuses.has(status);
}

function extractPaymentEntries(receipt, paymentTypeMap) {
  const payments =
    receipt.payments ||
    receipt.payment_details ||
    receipt.payment_type_totals ||
    [];

  if (Array.isArray(payments) && payments.length > 0) {
    return payments.map((payment) => {
      const paymentTypeId = payment.payment_type_id || payment.paymentTypeId || payment.type_id;
      const mapped = paymentTypeId ? paymentTypeMap.get(paymentTypeId) : null;

      const paymentTypeLabel = [
        payment.payment_type,
        payment.payment_type_name,
        payment.name,
        payment.type,
        mapped?.name,
        mapped?.type
      ]
        .filter(Boolean)
        .join(' ');

      const rawAmount =
        payment.money_amount ??
        payment.amount_money?.amount ??
        payment.amount_money ??
        payment.amount ??
        payment.collected_money ??
        payment.total_money ??
        payment.value ??
        0;

      return {
        paymentTypeLabel,
        amount: normalizeMoney(rawAmount)
      };
    });
  }

  return [
    {
      paymentTypeLabel: [
        receipt.payment_type,
        receipt.payment_type_name,
        receipt.tender_type,
        receipt.payment_method
      ]
        .filter(Boolean)
        .join(' '),
      amount: normalizeMoney(
        receipt.total_money ??
        receipt.total ??
        receipt.total_paid_money ??
        0
      )
    }
  ];
}

function extractDiscountValue(entry) {
  const rawAmount =
    entry?.money_amount ??
    entry?.amount_money?.amount ??
    entry?.amount_money ??
    entry?.amount ??
    entry?.discount_money ??
    entry?.discount_amount ??
    entry?.total_discount_money ??
    entry?.value ??
    0;

  return normalizeMoney(rawAmount);
}

function extractDiscountPercentage(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const directCandidates = [
    entry.percentage,
    entry.percent,
    entry.rate,
    entry.discount_rate,
    entry.value_percentage
  ];

  for (const candidate of directCandidates) {
    const normalized =
      typeof candidate === 'string'
        ? candidate.replace('%', '').trim()
        : candidate;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed !== 0) {
      return roundCurrency(Math.abs(parsed));
    }
  }

  const typeText = [
    entry.type,
    entry.discount_type,
    entry.value_type,
    entry.calculation_type,
    entry.amount_type
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const valueCandidateRaw =
    typeof entry.value === 'string'
      ? entry.value.replace('%', '').trim()
      : entry.value;
  const valueCandidate = Number(valueCandidateRaw);
  if (typeText.includes('PERCENT') && Number.isFinite(valueCandidate) && valueCandidate !== 0) {
    return roundCurrency(Math.abs(valueCandidate));
  }

  return null;
}

function createDiscountEntry(amount, percentage = null) {
  const normalizedAmount = roundCurrency(Math.abs(amount));
  if (normalizedAmount <= 0) {
    return null;
  }

  const normalizedPercentage =
    percentage === null || percentage === undefined
      ? null
      : roundCurrency(Math.abs(Number(percentage)));

  return {
    amount: normalizedAmount,
    percentage: Number.isFinite(normalizedPercentage) && normalizedPercentage > 0 ? normalizedPercentage : null
  };
}

function extractDiscountEntriesFromReceipt(receipt) {
  const receiptLevelCandidates = [
    receipt.total_discounts_money,
    receipt.total_discount_money,
    receipt.total_discount,
    receipt.discount_money,
    receipt.discount_amount,
    receipt.discount
  ];

  const entries = [];

  const receiptDiscountLists = [
    receipt.discounts,
    receipt.applied_discounts
  ];

  for (const list of receiptDiscountLists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const discount of list) {
      const amount = Math.abs(extractDiscountValue(discount));
      const entry = createDiscountEntry(amount, extractDiscountPercentage(discount));
      if (entry) {
        entries.push(entry);
      }
    }
  }

  const lineItems = receipt.line_items || receipt.items || [];
  if (Array.isArray(lineItems)) {
    for (const line of lineItems) {
      const lineLevelCandidates = [
        line.total_discounts_money,
        line.total_discount_money,
        line.discount_money,
        line.discount_amount,
        line.discount
      ];

      let lineDiscount = null;
      for (const candidate of lineLevelCandidates) {
        const amount = Math.abs(normalizeMoney(candidate));
        if (amount > 0) {
          lineDiscount = createDiscountEntry(amount, extractDiscountPercentage(line));
          break;
        }
      }

      if (lineDiscount) {
        entries.push(lineDiscount);
        continue;
      }

      const lineDiscountLists = [line.discounts, line.applied_discounts];
      for (const list of lineDiscountLists) {
        if (!Array.isArray(list)) {
          continue;
        }
        for (const discount of list) {
          const amount = Math.abs(extractDiscountValue(discount));
          const percentage = extractDiscountPercentage(discount) ?? extractDiscountPercentage(line);
          const entry = createDiscountEntry(amount, percentage);
          if (entry) {
            entries.push(entry);
          }
        }
      }
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  const fallbackPercentage = extractDiscountPercentage(receipt);
  for (const candidate of receiptLevelCandidates) {
    const amount = Math.abs(normalizeMoney(candidate));
    const entry = createDiscountEntry(amount, fallbackPercentage);
    if (entry) {
      return [entry];
    }
  }

  return [];
}

async function fetchSalesSummaryByDate(date) {
  const paymentTypeMap = await fetchPaymentTypeMap();
  const receipts = await fetchClosedReceiptsByDate(date);

  const totals = {
    total_cash: 0,
    total_card: 0,
    total_discount: 0,
    total_orders: 0,
    unclassified_amount: 0,
    cash_entries: [],
    card_entries: [],
    discount_entries: [],
    discount_entry_details: []
  };

  const closedReceipts = receipts.filter(isCompletedReceipt);

  for (const receipt of closedReceipts) {
    const paymentEntries = extractPaymentEntries(receipt, paymentTypeMap);
    const discountEntries = extractDiscountEntriesFromReceipt(receipt);

    for (const discountEntry of discountEntries) {
      totals.total_discount += discountEntry.amount;
      totals.discount_entries.push(discountEntry.amount);
      totals.discount_entry_details.push(discountEntry);
    }

    for (const entry of paymentEntries) {
      const paymentCategory = classifyPaymentType(entry.paymentTypeLabel);
      if (paymentCategory === 'cash') {
        totals.total_cash += entry.amount;
        totals.cash_entries.push(roundCurrency(entry.amount));
      } else if (paymentCategory === 'card') {
        totals.total_card += entry.amount;
        totals.card_entries.push(roundCurrency(entry.amount));
      } else {
        totals.unclassified_amount += entry.amount;
      }
    }
  }

  totals.total_cash = roundCurrency(totals.total_cash);
  totals.total_card = roundCurrency(totals.total_card);
  totals.total_discount = roundCurrency(totals.total_discount);
  totals.total_orders = closedReceipts.length;

  const netSale = calculateNetSale({
    cash_total: totals.total_cash,
    card_total: totals.total_card
  });

  return {
    date,
    cash_total: totals.total_cash,
    card_total: totals.total_card,
    net_sale: netSale,
    total_orders: totals.total_orders,
    unclassified_amount: roundCurrency(totals.unclassified_amount),
    cash_entries: totals.cash_entries,
    card_entries: totals.card_entries,
    total_discount: totals.total_discount,
    discount_entries: totals.discount_entries,
    discount_entry_details: totals.discount_entry_details
  };
}

module.exports = {
  fetchSalesSummaryByDate,
  fetchClosedReceiptsByDate,
  fetchPaymentTypeMap,
  extractPaymentEntries,
  classifyPaymentType,
  isCompletedReceipt
};
