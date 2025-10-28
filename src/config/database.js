import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'election_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  ssl: {
    rejectUnauthorized: false, // ✅ allows self-signed certificates
  },

});

pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Test connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    console.log('✅ Database connection test successful:', result.rows[0].now);
    client.release();
  } catch (err) {
    console.error('❌ Database connection test failed:', err);
  }
};

testConnection();

export default pool;