const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
  syncButton: document.getElementById('syncButton'),
  cashTotal: document.getElementById('cashTotal'),
  cardTotal: document.getElementById('cardTotal'),
  transferTotal: document.getElementById('transferTotal'),
  totalOrders: document.getElementById('totalOrders'),
  netSale: document.getElementById('netSale')
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
  return parseNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function setMessage(text, variant = 'info') {
  if (els.message) {
    els.message.textContent = text;
    els.message.className = `alert alert-${variant}`;
    setTimeout(() => {
      els.message.className = 'alert d-none';
    }, 5000);
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
    
    // Extract totals
    const cashTotal = parseNumber(data.cash_total);
    const cardTotal = parseNumber(data.card_total);
    const transferTotal = parseNumber(data.transfer_total);
    const totalOrders = data.total_orders || 0;
    const netSale = round2(cashTotal + cardTotal + transferTotal);

    // Update UI
    if (els.cashTotal) els.cashTotal.value = formatCurrency(cashTotal);
    if (els.cardTotal) els.cardTotal.value = formatCurrency(cardTotal);
    if (els.transferTotal) els.transferTotal.value = formatCurrency(transferTotal);
    if (els.totalOrders) els.totalOrders.value = totalOrders;
    if (els.netSale) els.netSale.value = formatCurrency(netSale);

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
