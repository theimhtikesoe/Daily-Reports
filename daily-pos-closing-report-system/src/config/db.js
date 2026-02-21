const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { Pool: PostgresPool } = require('pg');

const DIALECT = process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'postgres' : 'mysql';

function parseDbPort(value) {
  const parsed = Number(value || 3306);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3306;
}

function getMysqlConfig() {
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

function getPostgresConfig() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  return {
    connectionString,
    max: 10,
    ssl: connectionString && !connectionString.includes('localhost')
      ? { rejectUnauthorized: false }
      : false
  };
}

function getMissingMysqlConfigKeys() {
  const requiredKeys = ['DB_HOST', 'DB_USER', 'DB_NAME'];
  return requiredKeys.filter((key) => !process.env[key]);
}

function getMissingPostgresConfigKeys() {
  const requiredKeys = ['DATABASE_URL'];
  return requiredKeys.filter((key) => !process.env[key] && !(key === 'DATABASE_URL' && process.env.POSTGRES_URL));
}

function assertDbConfigured() {
  const missingKeys = DIALECT === 'postgres'
    ? getMissingPostgresConfigKeys()
    : getMissingMysqlConfigKeys();

  if (missingKeys.length > 0) {
    const error = new Error(`Missing database configuration: ${missingKeys.join(', ')}`);
    error.status = 500;
    throw error;
  }
}

let mysqlPool;
let postgresPool;

function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool(getMysqlConfig());
  }
  return mysqlPool;
}

function getPostgresPool() {
  if (!postgresPool) {
    postgresPool = new PostgresPool(getPostgresConfig());
  }
  return postgresPool;
}

function getSchemaFilePath() {
  if (DIALECT === 'postgres') {
    return path.join(__dirname, '../../sql/schema.postgres.sql');
  }
  return path.join(__dirname, '../../sql/schema.sql');
}

async function ensureDatabase() {
  assertDbConfigured();

  if (DIALECT === 'postgres') {
    return;
  }

  const dbConfig = getMysqlConfig();
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
  assertDbConfigured();

  const schemaPath = getSchemaFilePath();
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const statements = schemaSql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    if (DIALECT === 'postgres') {
      await getPostgresPool().query(statement);
    } else {
      await getMysqlPool().query(statement);
    }
  }
}

async function query(sql, params = []) {
  assertDbConfigured();

  if (DIALECT === 'postgres') {
    const result = await getPostgresPool().query(sql, params);
    return result.rows;
  }

  const [rows] = await getMysqlPool().execute(sql, params);
  return rows;
}

async function testConnection() {
  await query('SELECT 1');
}

function getDialect() {
  return DIALECT;
}

module.exports = {
  query,
  ensureDatabase,
  initializeSchema,
  testConnection,
  getDialect
};
