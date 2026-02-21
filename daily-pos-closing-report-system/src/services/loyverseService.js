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

async function fetchSalesSummaryByDate(date) {
  const paymentTypeMap = await fetchPaymentTypeMap();
  const receipts = await fetchClosedReceiptsByDate(date);

  const totals = {
    total_cash: 0,
    total_card: 0,
    total_orders: 0,
    unclassified_amount: 0,
    cash_entries: [],
    card_entries: []
  };

  const closedReceipts = receipts.filter(isCompletedReceipt);

  for (const receipt of closedReceipts) {
    const paymentEntries = extractPaymentEntries(receipt, paymentTypeMap);

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
    card_entries: totals.card_entries
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
