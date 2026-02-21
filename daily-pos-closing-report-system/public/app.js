const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
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
  openingCash: document.getElementById('openingCash'),
  actualCashCounted: document.getElementById('actualCashCounted'),
  expectedCash: document.getElementById('expectedCash'),
  difference: document.getElementById('difference'),
  reportsTableBody: document.querySelector('#reportsTable tbody'),
  unclassifiedHint: document.getElementById('unclassifiedHint')
};

let chart;

function todayLocalDate() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  let normalized = String(value).trim();
  if (normalized === '') {
    return 0;
  }

  if (/^-?\d+,\d+$/.test(normalized) && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function setMessage(text, variant = 'info') {
  els.message.textContent = text;
  els.message.className = `alert alert-${variant}`;
}

function clearMessage() {
  els.message.className = 'alert d-none';
  els.message.textContent = '';
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'THB'
  }).format(parseNumber(value));
}

function getReportFileBaseName() {
  const date = els.reportDate.value || todayLocalDate();
  return `daily-report-${date}`.replace(/[^\w.-]+/g, '_');
}

function setButtonLoading(button, loadingText, isLoading) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

async function captureReportSection() {
  if (!els.reportSection) {
    throw new Error('Report section not found.');
  }

  if (typeof window.html2canvas !== 'function') {
    throw new Error('Export library is not loaded.');
  }

  return window.html2canvas(els.reportSection, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    ignoreElements: (element) => element.classList?.contains('no-export')
  });
}

function printReport() {
  clearMessage();
  window.print();
}

async function downloadReportAsImage() {
  clearMessage();
  setButtonLoading(els.downloadImageButton, 'Generating...', true);

  try {
    const canvas = await captureReportSection();
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${getReportFileBaseName()}.png`;
    link.click();
    setMessage('Image downloaded successfully.', 'success');
  } catch (error) {
    setMessage(error.message || 'Failed to download image.', 'danger');
  } finally {
    setButtonLoading(els.downloadImageButton, 'Generating...', false);
  }
}

async function downloadReportAsPdf() {
  clearMessage();
  setButtonLoading(els.downloadPdfButton, 'Generating...', true);

  try {
    if (!window.jspdf?.jsPDF) {
      throw new Error('PDF library is not loaded.');
    }

    const canvas = await captureReportSection();
    const imageData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const margin = 8;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const imageHeight = (canvas.height * contentWidth) / canvas.width;

    let heightLeft = imageHeight;
    let offsetY = 0;

    pdf.addImage(imageData, 'PNG', margin, margin + offsetY, contentWidth, imageHeight, undefined, 'FAST');
    heightLeft -= contentHeight;

    while (heightLeft > 0) {
      offsetY = heightLeft - imageHeight;
      pdf.addPage();
      pdf.addImage(imageData, 'PNG', margin, margin + offsetY, contentWidth, imageHeight, undefined, 'FAST');
      heightLeft -= contentHeight;
    }

    pdf.save(`${getReportFileBaseName()}.pdf`);
    setMessage('PDF downloaded successfully.', 'success');
  } catch (error) {
    setMessage(error.message || 'Failed to download PDF.', 'danger');
  } finally {
    setButtonLoading(els.downloadPdfButton, 'Generating...', false);
  }
}

function recalculate() {
  const openingCash = parseNumber(els.openingCash.value);
  const cashTotal = parseNumber(els.cashTotal.value);
  const expense = parseNumber(els.expense.value);
  const actualCashCounted = parseNumber(els.actualCashCounted.value);
  const cardTotal = parseNumber(els.cardTotal.value);

  const expectedCash = round2(openingCash + cashTotal - expense);
  const difference = round2(actualCashCounted - expectedCash);
  const netSale = round2(cashTotal + cardTotal);

  els.expectedCash.value = expectedCash.toFixed(2);
  els.difference.value = difference.toFixed(2);
  els.netSale.value = netSale.toFixed(2);

  els.difference.classList.remove('diff-positive', 'diff-negative');
  if (difference > 0) {
    els.difference.classList.add('diff-positive');
  } else if (difference < 0) {
    els.difference.classList.add('diff-negative');
  }
}

function getReportPayload() {
  return {
    date: els.reportDate.value,
    cash_total: parseNumber(els.cashTotal.value),
    card_total: parseNumber(els.cardTotal.value),
    total_orders: parseInt(els.totalOrders.value || '0', 10),
    expense: parseNumber(els.expense.value),
    tip: parseNumber(els.tip.value),
    opening_cash: parseNumber(els.openingCash.value),
    actual_cash_counted: parseNumber(els.actualCashCounted.value)
  };
}

function applyReportData(report) {
  els.cashTotal.value = round2(parseNumber(report.cash_total)).toFixed(2);
  els.cardTotal.value = round2(parseNumber(report.card_total)).toFixed(2);
  els.totalOrders.value = parseInt(report.total_orders || 0, 10);
  els.netSale.value = round2(parseNumber(report.net_sale)).toFixed(2);
  els.expense.value = round2(parseNumber(report.expense)).toFixed(2);
  els.tip.value = round2(parseNumber(report.tip)).toFixed(2);
  els.openingCash.value = round2(parseNumber(report.opening_cash)).toFixed(2);
  els.actualCashCounted.value = round2(parseNumber(report.actual_cash_counted)).toFixed(2);
  recalculate();
}

function resetManualFields() {
  els.expense.value = '0.00';
  els.tip.value = '0.00';
  els.openingCash.value = '0.00';
  els.actualCashCounted.value = '0.00';
  recalculate();
}

function resetSyncedFields() {
  els.cashTotal.value = '0.00';
  els.cardTotal.value = '0.00';
  els.totalOrders.value = '0';
  els.netSale.value = '0.00';
}

function ensureManualInputsEnabled() {
  [els.expense, els.tip, els.openingCash, els.actualCashCounted].forEach((input) => {
    input.readOnly = false;
    input.disabled = false;
  });
}

async function loadSavedReport() {
  clearMessage();
  ensureManualInputsEnabled();

  if (!els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/reports/${els.reportDate.value}`);
    if (response.status === 404) {
      resetSyncedFields();
      resetManualFields();
      setMessage('No saved report found for this date.', 'secondary');
      return;
    }

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to load report');
    }

    const report = await response.json();
    applyReportData(report);
    setMessage('Saved report loaded.', 'success');
  } catch (error) {
    setMessage(error.message, 'danger');
  }
}

async function syncFromLoyverse() {
  clearMessage();
  ensureManualInputsEnabled();

  if (!els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  els.syncButton.disabled = true;
  els.syncButton.textContent = 'Syncing...';

  try {
    const response = await fetch(`/api/loyverse/sync?date=${encodeURIComponent(els.reportDate.value)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Sync failed');
    }

    els.cashTotal.value = round2(parseNumber(data.cash_total)).toFixed(2);
    els.cardTotal.value = round2(parseNumber(data.card_total)).toFixed(2);
    els.netSale.value = round2(parseNumber(data.net_sale)).toFixed(2);
    els.totalOrders.value = parseInt(data.total_orders || 0, 10);

    if (parseNumber(data.unclassified_amount) > 0) {
      els.unclassifiedHint.textContent =
        `Unclassified payment amount: ${formatCurrency(data.unclassified_amount)} (not included in Cash/Card totals).`;
    } else {
      els.unclassifiedHint.textContent = '';
    }

    recalculate();
    setMessage('Loyverse data synced successfully.', 'success');
  } catch (error) {
    setMessage(error.message, 'danger');
  } finally {
    els.syncButton.disabled = false;
    els.syncButton.textContent = 'Sync From Loyverse';
  }
}

async function saveReport() {
  clearMessage();

  if (!els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  els.saveButton.disabled = true;
  els.saveButton.textContent = 'Saving...';

  try {
    const payload = getReportPayload();

    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Save failed');
    }

    applyReportData(data);
    setMessage('Daily report saved successfully.', 'success');
    await Promise.all([loadReportHistory(), loadNetSalesChart()]);
  } catch (error) {
    setMessage(error.message, 'danger');
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.textContent = 'Save Daily Report';
  }
}

function renderReportsTable(reports) {
  els.reportsTableBody.innerHTML = '';

  if (!reports.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="8" class="text-center text-muted">No reports found</td>';
    els.reportsTableBody.appendChild(tr);
    return;
  }

  for (const report of reports) {
    const tr = document.createElement('tr');
    const difference = parseNumber(report.difference);
    tr.innerHTML = `
      <td>${String(report.date).slice(0, 10)}</td>
      <td>${formatCurrency(report.net_sale)}</td>
      <td>${formatCurrency(report.cash_total)}</td>
      <td>${formatCurrency(report.card_total)}</td>
      <td>${parseInt(report.total_orders || 0, 10)}</td>
      <td>${formatCurrency(report.expense)}</td>
      <td>${formatCurrency(report.expected_cash)}</td>
      <td class="${difference > 0 ? 'diff-positive' : difference < 0 ? 'diff-negative' : ''}">${formatCurrency(difference)}</td>
    `;
    els.reportsTableBody.appendChild(tr);
  }
}

async function loadReportHistory() {
  const params = new URLSearchParams();
  if (els.fromDate.value) {
    params.set('from', els.fromDate.value);
  }
  if (els.toDate.value) {
    params.set('to', els.toDate.value);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/reports${query}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to load history');
  }

  renderReportsTable(data);
}

async function loadNetSalesChart() {
  const response = await fetch('/api/reports/last-7/net-sales');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to load chart data');
  }

  const labels = data.map((item) => String(item.date).slice(0, 10));
  const values = data.map((item) => round2(parseNumber(item.net_sale)));

  const ctx = document.getElementById('netSalesChart');
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Net Sale',
          data: values,
          backgroundColor: '#0d6efd'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function bindEvents() {
  document.querySelectorAll('.calc-input').forEach((input) => {
    input.addEventListener('input', recalculate);
  });

  els.loadButton.addEventListener('click', loadSavedReport);
  els.syncButton.addEventListener('click', syncFromLoyverse);
  els.saveButton.addEventListener('click', saveReport);
  els.printButton.addEventListener('click', printReport);
  els.downloadImageButton.addEventListener('click', downloadReportAsImage);
  els.downloadPdfButton.addEventListener('click', downloadReportAsPdf);

  els.filterReports.addEventListener('click', async () => {
    try {
      clearMessage();
      await loadReportHistory();
    } catch (error) {
      setMessage(error.message, 'danger');
    }
  });

  els.reportDate.addEventListener('change', () => {
    clearMessage();
    els.unclassifiedHint.textContent = '';
  });
}

async function initializePage() {
  els.reportDate.value = todayLocalDate();
  els.fromDate.value = dayjsOffset(-6);
  els.toDate.value = todayLocalDate();

  resetManualFields();
  resetSyncedFields();
  ensureManualInputsEnabled();

  bindEvents();

  try {
    await Promise.all([loadSavedReport(), loadReportHistory(), loadNetSalesChart()]);
  } catch (error) {
    setMessage(error.message, 'danger');
  }
}

function dayjsOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date - tzOffset).toISOString().slice(0, 10);
}

initializePage();
