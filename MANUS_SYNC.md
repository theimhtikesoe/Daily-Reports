# Manus AI Synchronization Log

This file tracks the status of the Daily POS Closing & Report System project and serves as a handover document for AI agents.

## Project Overview
A Loyverse-integrated daily closing workflow system for BestBuds.

## Recent Accomplishments (2026-04-18)
- **Gram Calculation Fix**: Corrected the bug where items with a price of 0 or 100% discount were incorrectly included in the total gram count.
- **Receipt-Level Discount Support**: Enhanced the gram exclusion logic to detect 100% discounts applied at the receipt level (not just item level).
- **Service Consistency**: Applied fixes to both `loyverseService.js` (web dashboard) and `excelExportService.js` (Excel reports).

## Current Status & Discrepancies
After analyzing the frontend (`public/app.js`) and backend (`src/services/`), the following discrepancies were identified:

| Feature | Frontend (`app.js`) | Backend (`loyverseService.js`) | Status |
| :--- | :--- | :--- | :--- |
| **Gram Exclusion** | Excludes items with price <= 0.01 or discount >= 99.99%. | **[FIXED]** Now matches frontend and handles receipt-level discounts. | Synchronized |
| **Keywords** | Uses a specific list of flower strains and F&B keywords. | Uses `itemClassifier.js` which has slightly different keyword matching logic. | Minor Discrepancy |
| **Refund Logic** | Extensive refund/void detection using status and receipt notes. | Uses `isRefundReceipt` with standard Loyverse fields. | Potential Inconsistency |
| **Lemon Cherry Fix** | Overrides qty to 7G if price >= 4970. | Overrides qty to 7G if price >= 4970. | Synchronized |

## Pending Tasks
- [ ] **Synchronize Keywords**: Ensure `itemClassifier.js` and `app.js` use the exact same keyword lists to prevent classification mismatches between the dashboard and reports.
- [ ] **Unified Refund Logic**: Standardize how refunded/voided receipts are detected across the system.
- [ ] **Data Validation**: Further testing with complex multi-item receipts containing mixed discounts.

## Instructions for Future Agents
When working on gram or price calculations, always check both `src/services/loyverseService.js` and `src/services/excelExportService.js` to ensure the logic remains identical.
