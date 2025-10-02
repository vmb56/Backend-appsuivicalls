// db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'sql8.freesqldatabase.com',        // évite "localhost" (socket)
  user: 'sql8801066',
  password: 'RrIKmXGYh8',
  database: 'sql8801066',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// (optionnel) petit ping au chargement
(async () => {
  try {
    const c = await pool.getConnection();
    await c.ping();
    console.log('✅ Connecté à MySQL (pool)');
    c.release();
  } catch (err) {
    console.error('❌ Erreur MySQL init:', err.code, err.message);
  }
})();

module.exports = pool;
