# Daily POS Closing & Report System

Production-ready web application for daily store closing with Loyverse integration.

## Tech Stack

- Backend: Node.js + Express
- Database: MySQL
- Frontend: Bootstrap + Vanilla JS
- Charts: Chart.js

## Project Structure

```text
daily-pos-closing-report-system/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── sql/
│   └── schema.sql
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── reportController.js
│   ├── jobs/
│   │   └── dailySyncJob.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── routes/
│   │   └── apiRoutes.js
│   ├── services/
│   │   └── loyverseService.js
│   ├── utils/
│   │   └── calculations.js
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Features

- Date selector for daily report
- Sync sales data from Loyverse receipts API
- Payment split totals: Cash and Card
- Auto-calculated:
  - Net Sale = Cash + Card
  - Expected Cash = Opening Cash + Cash Total - Expense
  - Difference = Actual Cash Counted - Expected Cash
- Manual inputs:
  - Expense
  - Tip
  - Opening Cash
  - Actual Cash Counted
- Save or update daily report (upsert by date)
- Historical report list with date filters
- Last 7 days net sale chart
- Optional cron job for automatic daily sync at 23:59

## Database Schema

Run SQL from `sql/schema.sql` or let the app auto-create on startup.

Main table: `daily_reports` with fields:

- `id`
- `date` (unique)
- `net_sale`
- `cash_total`
- `card_total`
- `total_orders`
- `expense`
- `tip`
- `opening_cash`
- `actual_cash_counted`
- `expected_cash`
- `difference`
- `created_at`
- `updated_at`

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required keys:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `LOYVERSE_API_TOKEN`

Optional:

- `LOYVERSE_API_BASE_URL` (default `https://api.loyverse.com/v1.0`)
- `LOYVERSE_MONEY_DIVISOR` (default `100` for minor units)
- `AUTO_SYNC_ENABLED` (`true`/`false`)
- `AUTO_SYNC_TIME` (cron expression, default `59 23 * * *`)

## Install & Run

```bash
npm install
npm run dev
```

App URL:

- `http://localhost:4000`

## API Endpoints

- `GET /api/health`
- `GET /api/loyverse/sync?date=YYYY-MM-DD`
- `POST /api/reports`
- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/reports/:date`
- `GET /api/reports/last-7/net-sales`

## Security Notes

- Loyverse API token is server-side only (`.env`), never exposed to browser.
- Basic request validation for date and numeric values.
- Centralized API error handling.

## Cron Auto-Sync (Optional)

Set in `.env`:

```env
AUTO_SYNC_ENABLED=true
AUTO_SYNC_TIME=59 23 * * *
```

When enabled, server will auto-sync today's Loyverse totals and upsert the current day report.

## PDF Export (Optional Extension)

Not included by default. Can be added with a separate endpoint using `pdfkit` or `puppeteer`.
