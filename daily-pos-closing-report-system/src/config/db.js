const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function parseDbPort(value) {
  const parsed = Number(value || 3306);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3306;
}

function getDbConfig() {
  return {
    host: process.env.DB_HOST,
    port: parseDbPort(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true
  };
}

function getMissingDbConfigKeys() {
  const requiredKeys = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  return requiredKeys.filter((key) => !process.env[key]);
}

function assertDbConfigured() {
  const missingKeys = getMissingDbConfigKeys();
  if (missingKeys.length > 0) {
    const error = new Error(`Missing database configuration: ${missingKeys.join(', ')}`);
    error.status = 500;
    throw error;
  }
}

let pool;

function getPool() {
  if (!pool) {
    assertDbConfigured();
    pool = mysql.createPool(getDbConfig());
  }
  return pool;
}

async function ensureDatabase() {
  assertDbConfigured();
  const dbConfig = getDbConfig();
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  } finally {
    await connection.end();
  }
}

async function initializeSchema() {
  const schemaPath = path.join(__dirname, '../../sql/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const statements = schemaSql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await getPool().query(statement);
  }
}

async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function testConnection() {
  await getPool().query('SELECT 1');
}

module.exports = {
  query,
  ensureDatabase,
  initializeSchema,
  testConnection
};
