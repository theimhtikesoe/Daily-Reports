require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/apiRoutes');
const { ensureDatabase, initializeSchema } = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { scheduleDailySyncJob } = require('./jobs/dailySyncJob');

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use('/api', notFoundHandler);

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

async function startServer() {
  await ensureDatabase();
  await initializeSchema();
  scheduleDailySyncJob();

  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
