const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
  transferTotal: document.getElementById('transferTotal'),
  reportSection: document.getElementById('reportSection'),
  loadButton: document.getElementById('loadButton'),
  syncButton: document.getElementById('syncButton'),
  saveButton: document.getElementById('saveButton'),
  printButton: document.getElementById('printButton'),
  downloadImageButton: document.getElementById('downloadImageButton'),
  downloadPdfButton: document.getElementById('downloadPdfButton'),
  filterReports: document.getElementById('filterReports'),
  fromDate: document.getElementById('fromDate'),
  toDate: document.getElementById('toDate'),
  cashTotal: document.getElementById('cashTotal'),
  cardTotal: document.getElementById('cardTotal'),
  totalOrders: document.getElementById('totalOrders'),
  netSale: document.getElementById('netSale'),
  expense: document.getElementById('expense'),
  tip: document.getElementById('tip'),
  oneKBillCount: document.getElementById('oneKBillCount'),
  openingCash: document.getElementById('openingCash'),
  actualCashCounted: document.getElementById('actualCashCounted'),
  expectedCash: document.getElementById('expectedCash'),
  difference: document.getElementById('difference'),
  safeBoxApplied: document.getElementById('safeBoxApplied'),
  cashEntriesList: document.getElementById('cashEntriesList'),
  cardEntriesList: document.getElementById('cardEntriesList'),
  transferEntriesList: document.getElementById('transferEntriesList'),
  discountEntriesList: document.getElementById('discountEntriesList'),
  cashEntriesTotal: document.getElementById('cashEntriesTotal'),
  cardEntriesTotal: document.getElementById('cardEntriesTotal'),
  transferEntriesTotal: document.getElementById('transferEntriesTotal'),
  discountEntriesTotal: document.getElementById('discountEntriesTotal'),
  reportsTableBody: document.querySelector('#reportsTable tbody'),
  unclassifiedHint: document.getElementById('unclassifiedHint')
};

function todayLocalDate() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let normalized = String(value).trim().replace(/฿/g, '').replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'THB'
  }).format(parseNumber(value));
}

function formatPercentage(value) {
  const normalized = round2(parseNumber(value));
  return `${normalized}%`;
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          amount: round2(parseNumber(entry.amount)),
          percentage: entry.percentage || entry.percent || null
        };
      }
      return { amount: round2(parseNumber(entry)), percentage: null };
    })
    .filter((entry) => entry.amount !== 0);
}

function renderEntryList(listElement, entries, options = {}) {
  if (!listElement) return;
  listElement.innerHTML = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'text-muted';
    li.textContent = '-';
    listElement.appendChild(li);
    return;
  }
  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = entry.percentage ? `${entry.percentage}% • ${formatCurrency(entry.amount)}` : formatCurrency(entry.amount);
    listElement.appendChild(li);
  });
}

function applyPaymentDetails(data) {
  const cashEntries = normalizeEntries(data.cash_entries);
  const cardEntries = normalizeEntries(data.card_entries);
  const transferEntries = normalizeEntries(data.transfer_entries);
  const discountEntries = normalizeEntries(data.discount_entry_details || data.discount_entries);

  renderEntryList(els.cashEntriesList, cashEntries);
  renderEntryList(els.cardEntriesList, cardEntries);
  renderEntryList(els.transferEntriesList, transferEntries);
  renderEntryList(els.discountEntriesList, discountEntries);

  const cashTotal = cashEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const cardTotal = cardEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const transferTotal = transferEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const discountTotal = discountEntries.reduce((sum, entry) => sum + entry.amount, 0);

  if (els.cashEntriesTotal) els.cashEntriesTotal.textContent = formatCurrency(cashTotal);
  if (els.cardEntriesTotal) els.cardEntriesTotal.textContent = formatCurrency(cardTotal);
  if (els.transferEntriesTotal) els.transferEntriesTotal.textContent = formatCurrency(transferTotal);
  if (els.discountEntriesTotal) els.discountEntriesTotal.textContent = formatCurrency(discountTotal);

  // Update Summary Inputs
  if (els.cashTotal) els.cashTotal.value = formatCurrency(cashTotal);
  if (els.cardTotal) els.cardTotal.value = formatCurrency(cardTotal);
  if (els.transferTotal) els.transferTotal.value = formatCurrency(transferTotal);
  
  const netSale = round2(cashTotal + cardTotal + transferTotal);
  if (els.netSale) els.netSale.value = formatCurrency(netSale);
}

function setMessage(text, variant = 'info') {
  if (els.message) {
    els.message.textContent = text;
    els.message.className = `alert alert-${variant}`;
  }
}

async function syncFromLoyverse() {
  if (!els.reportDate || !els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  if (els.syncButton) {
    els.syncButton.disabled = true;
    els.syncButton.textContent = 'Syncing...';
  }

  try {
    const response = await fetch(`/api/loyverse/sync?date=${els.reportDate.value}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Sync failed');
    
    applyPaymentDetails(data);
    setMessage('Loyverse data synced successfully.', 'success');
  } catch (error) {
    setMessage(error.message, 'danger');
  } finally {
    if (els.syncButton) {
      els.syncButton.disabled = false;
      els.syncButton.textContent = 'Sync From Loyverse';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (els.reportDate) {
    els.reportDate.value = todayLocalDate();
    els.reportDate.addEventListener('change', syncFromLoyverse);
  }
  if (els.syncButton) {
    els.syncButton.addEventListener('click', syncFromLoyverse);
  }
  // Initial sync
  syncFromLoyverse();
});
