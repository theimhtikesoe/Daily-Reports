/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Performs full client-side Excel export using ExcelJS
 */

let currentEditingExpenseId = null;

/**
 * Get expenses from LocalStorage
 */
function getLocalExpenses(date) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  return allExpenses[date] || [];
}

/**
 * Save expenses to LocalStorage
 */
function saveLocalExpenses(date, expenses) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  allExpenses[date] = expenses;
  localStorage.setItem('daily_expenses', JSON.stringify(allExpenses));
}

/**
 * Add or Update expense (LocalStorage Version)
 */
async function addExpenseToReport() {
  const dateInput = document.getElementById('reportDate');
  const categorySelect = document.getElementById('expenseCategory');
  const descriptionInput = document.getElementById('expenseDescription');
  const amountInput = document.getElementById('expenseAmount');
  const submitBtn = document.querySelector('#expenseSection button');

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || '';
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    showMessage('Please fill in all expense fields', 'warning');
    return;
  }

  try {
    let expenses = getLocalExpenses(date);

    if (currentEditingExpenseId) {
      // Update existing
      expenses = expenses.map(exp => {
        if (exp.id === currentEditingExpenseId) {
          return { ...exp, category, description, amount };
        }
        return exp;
      });
      showMessage('Expense updated successfully', 'success');
      currentEditingExpenseId = null;
      if (submitBtn) submitBtn.textContent = 'Add Expense';
    } else {
      // Add new
      const newExpense = {
        id: Date.now(),
        date,
        category,
        description,
        amount,
        created_at: new Date().toISOString()
      };
      expenses.push(newExpense);
      showMessage('Expense added successfully', 'success');
    }
    
    saveLocalExpenses(date, expenses);

    // Clear form
    categorySelect.value = '';
    descriptionInput.value = '';
    amountInput.value = '';
    
    renderExpensesList(expenses, date);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Edit an expense (Load into form)
 */
function editExpense(id, date) {
  const expenses = getLocalExpenses(date);
  const expense = expenses.find(e => e.id === id);
  
  if (!expense) return;

  document.getElementById('expenseCategory').value = expense.category;
  document.getElementById('expenseDescription').value = expense.description || '';
  document.getElementById('expenseAmount').value = expense.amount;
  
  currentEditingExpenseId = id;
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Update Expense';
  
  // Scroll to form
  document.getElementById('expenseSection').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Cancel editing
 */
function cancelEdit() {
  currentEditingExpenseId = null;
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseAmount').value = '';
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Add Expense';
}

/**
 * Load expenses for a specific date
 */
async function loadExpenses(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
}

/**
 * Render expenses list in the UI
 */
function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;

  if (expenses.length === 0) {
    container.innerHTML = '<p class="text-muted">No expenses recorded</p>';
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead class="table-dark">
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `
      <tr>
        <td><span class="badge bg-secondary">${expense.category}</span></td>
        <td>${expense.description || '-'}</td>
        <td class="fw-bold">${amount.toLocaleString()} THB</td>
        <td class="text-end">
          <button class="btn btn-xs btn-outline-info me-1" onclick="editExpense(${expense.id}, '${date}')">Edit</button>
          <button class="btn btn-xs btn-outline-danger" onclick="deleteExpense(${expense.id}, '${date}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
        <tfoot class="table-light">
          <tr class="fw-bold">
            <td colspan="2">Total Expenses</td>
            <td colspan="2" class="text-primary">${total.toLocaleString()} THB</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Delete expense (LocalStorage Version)
 */
async function deleteExpense(id, date) {
  if (!confirm('Are you sure you want to delete this expense?')) return;

  try {
    let expenses = getLocalExpenses(date);
    expenses = expenses.filter(e => e.id !== id);
    saveLocalExpenses(date, expenses);

    showMessage('Expense deleted', 'success');
    renderExpensesList(expenses, date);
    
    if (currentEditingExpenseId === id) {
      cancelEdit();
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Full Client-Side Excel Export using ExcelJS
 */
async function exportReportToExcel() {
  const dateInput = document.getElementById('reportDate');
  const date = dateInput?.value;

  if (!date) {
    showMessage('Please select a date first', 'warning');
    return;
  }

  try {
    showMessage('Generating Excel file...', 'info');

    // 1. Gather Data from UI
    const salesTableRows = Array.from(document.querySelectorAll('#bestBudsSalesTable tbody tr'));
    const expenses = getLocalExpenses(date);
    
    // Extract totals from UI
    const cashTotal = parseFloat(document.getElementById('cashTotal')?.value) || 0;
    const cardTotal = parseFloat(document.getElementById('cardTotal')?.value) || 0;
    const transferTotal = parseFloat(document.getElementById('transferTotal')?.value) || 0;
    const netSale = parseFloat(document.getElementById('netSale')?.value) || 0;
    const totalGramsStr = document.getElementById('totalGramsSold')?.textContent || '0.000 G';
    const totalGrams = parseFloat(totalGramsStr.replace(/[^\d.]/g, '')) || 0;

    // Categorize sales items from UI table
    const flowerItems = [];
    const fbItems = [];
    
    salesTableRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3 || cells[0].textContent.includes('-')) return;
      
      const qtyStr = cells[0].textContent.trim();
      const itemName = cells[1].textContent.trim();
      const priceStr = cells[2].textContent.trim();
      
      // Parse Qty and Prices (Format: "Main / FB")
      const qty = parseFloat(qtyStr) || 0;
      const prices = priceStr.split('/').map(p => parseFloat(p.replace(/[^\d.]/g, '')) || 0);
      const mainPrice = prices[0] || 0;
      const fbPrice = prices[1] || 0;
      
      if (mainPrice > 0) {
        flowerItems.push({
          name: itemName,
          qty: qty,
          unitPrice: mainPrice / (qty || 1),
          totalPrice: mainPrice
        });
      }
      
      if (fbPrice > 0) {
        fbItems.push({
          name: itemName,
          qty: qty,
          unitPrice: fbPrice / (qty || 1),
          totalPrice: fbPrice
        });
      }
    });

    // 2. Create Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');

    // Helper for styling
    const setHeaderStyle = (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    };

    const setBorder = (cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    };

    // --- SECTION 1: FLOWER / MAIN ---
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `Daily Report - ${date}`;
    sheet.getCell('A1').font = { size: 14, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    let currRow = 3;
    sheet.getCell(`A${currRow}`).value = 'Flower / Main / Accessories';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FF0000FF' } };
    currRow++;

    const flowerHeaders = ['Item Type', 'Item Name', 'Qty', 'Unit Price', 'Total Price'];
    flowerHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    flowerItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'Flower/Main';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.unitPrice;
      sheet.getCell(`E${currRow}`).value = item.totalPrice;
      ['A','B','C','D','E'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 2: EXPENSES ---
    sheet.getCell(`A${currRow}`).value = 'Expenses';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
    currRow++;

    const expenseHeaders = ['Category', 'Description', 'Amount'];
    expenseHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    let totalExp = 0;
    expenses.forEach(exp => {
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description || '-';
      sheet.getCell(`C${currRow}`).value = exp.amount;
      totalExp += exp.amount;
      ['A','B','C'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 3: FOOD & DRINKS ---
    sheet.getCell(`A${currRow}`).value = 'Food & Drinks';
    sheet.getCell(`A${currRow}`).font = { bold: true, color: { argb: 'FF008000' } };
    currRow++;

    const fbHeaders = ['Item Type', 'Item Name', 'Qty', 'Unit Price', 'Total Price'];
    fbHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      setHeaderStyle(cell);
    });
    currRow++;

    fbItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = 'F&B';
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.unitPrice;
      sheet.getCell(`E${currRow}`).value = item.totalPrice;
      ['A','B','C','D','E'].forEach(col => setBorder(sheet.getCell(`${col}${currRow}`)));
      currRow++;
    });
    currRow += 2;

    // --- SECTION 4: DAILY SUMMARY DASHBOARD ---
    sheet.getCell(`A${currRow}`).value = 'Daily Summary Dashboard';
    sheet.getCell(`A${currRow}`).font = { bold: true, size: 12 };
    currRow++;

    const summaryData = [
      ['Total Grams Sold', totalGrams, 'G'],
      ['Cash In', cashTotal, 'THB'],
      ['Card In', cardTotal, 'THB'],
      ['Transfer In', transferTotal, 'THB'],
      ['Total Expenses', totalExp, 'THB'],
      ['Net Sales (Total)', netSale, 'THB'],
      ['Net Profit (After Expenses)', netSale - totalExp, 'THB']
    ];

    summaryData.forEach(data => {
      sheet.getCell(`A${currRow}`).value = data[0];
      sheet.getCell(`B${currRow}`).value = data[1];
      sheet.getCell(`C${currRow}`).value = data[2];
      sheet.getCell(`A${currRow}`).font = { bold: true };
      setBorder(sheet.getCell(`A${currRow}`));
      setBorder(sheet.getCell(`B${currRow}`));
      setBorder(sheet.getCell(`C${currRow}`));
      currRow++;
    });

    // Column Widths
    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 35;
    sheet.getColumn(3).width = 15;
    sheet.getColumn(4).width = 15;
    sheet.getColumn(5).width = 15;

    // 3. Save File
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BestBuds_Report_${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showMessage('Excel exported successfully!', 'success');
  } catch (error) {
    console.error('Export Error:', error);
    showMessage(`Export failed: ${error.message}`, 'danger');
  }
}

/**
 * Show message to user
 */
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  if (!messageEl) return;

  messageEl.className = `alert alert-${type}`;
  messageEl.textContent = text;
  messageEl.classList.remove('d-none');

  setTimeout(() => {
    messageEl.classList.add('d-none');
  }, 5000);
}

/**
 * Initialize enhancements
 */
function initializeEnhancements() {
  console.log('Initializing Enhancements...');
  
  // 1. Setup Export Button
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    console.log('Binding Export Button...');
    exportBtn.onclick = function(e) {
      e.preventDefault();
      exportReportToExcel();
    };
  }

  // 2. Date Change Listener
  const dateInput = document.getElementById('reportDate');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        loadExpenses(e.target.value);
      }
    });
    // Initial load if date is already set
    if (dateInput.value) {
      loadExpenses(dateInput.value);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
  initializeEnhancements();
}
