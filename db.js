// db.js — Turso/libSQL (CommonJS)
require("dotenv").config();

let db; // singleton

async function getDb() {
  if (!db) {
    const { createClient } = await import("@libsql/client");
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN, // omets si DB publique
    });
    // ping simple
    await db.execute("SELECT 1");
    console.log("✅ Connecté à Turso (libSQL)");
  }
  return db;
}

module.exports = { getDb };
