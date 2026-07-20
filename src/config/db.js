const mysql = require('mysql2/promise');
require('dotenv').config();

const parseMysqlUrl = (url = '') => {
  const raw = String(url || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    if (!/^mysql:$/i.test(parsed.protocol)) return null;

    return {
      host: parsed.hostname,
      port: parsed.port || '3306',
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : ''
    };
  } catch {
    return null;
  }
};

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.MYSQL_URL ||
  process.env.RAILWAY_DATABASE_URL ||
  '';

const parsedConnection = parseMysqlUrl(rawConnectionString);

const dbConfig = {
  host: process.env.DB_HOST || parsedConnection?.host || 'localhost',
  user: process.env.DB_USER || parsedConnection?.user || 'root',
  password: process.env.DB_PASSWORD || parsedConnection?.password || '',
  database: process.env.DB_NAME || parsedConnection?.database || 'db_desa_adat_cengkilung',
  port: Number(process.env.DB_PORT || parsedConnection?.port || 3306)
};

console.log('Database configuration:', {
  host: dbConfig.host,
  user: dbConfig.user,
  database: dbConfig.database,
  port: dbConfig.port,
  usingConnectionString: Boolean(rawConnectionString)
});

const pool = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    port: dbConfig.port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully to:', dbConfig.database);
        const [rows] = await connection.execute('SELECT 1 + 1 AS result');
        console.log('✅ Database query test successful:', rows[0]);
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// Backward-compatible export:
// 1) `const db = require('../config/db'); db.pool.execute(...)`
// 2) `const pool = require('../config/db'); pool.execute(...)`
const db = {
    pool,
    testConnection,
    execute: (...args) => pool.execute(...args),
    query: (...args) => pool.query(...args),
    getConnection: (...args) => pool.getConnection(...args)
};

module.exports = db;
