// routes/calls.js
const express = require("express");
const router = express.Router();
const pool = require("../db");

// petite utilitaire pour normaliser des strings (pour la recherche)
function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}




//ajout d'un appel
router.post("/", async (req, res) => {
  try {
    const {
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere = null,
      dejaPigier = false,
      maitriseInfo = "",
      dernierDiplome = "",
      createdAt, // optionnel
    } = req.body || {};

    // validations minimales
    if (!date || !heure || !appele || !contact) {
      return res.status(400).json({
        message:
          "Champs requis manquants: date, heure,  appele, contact",
      });
    }

    const sql = `
      INSERT INTO calls
        (date, heure, appelant, appele, contact, filiere, dejaPigier, maitriseInfo, dernierDiplome, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere || null,
      dejaPigier ? 1 : 0,
      maitriseInfo || "",
      dernierDiplome || "",
      createdAt || new Date().toISOString(),
    ];

    const [result] = await pool.query(sql, params);

    return res.status(201).json({
      id: result.insertId,
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere,
      dejaPigier: !!dejaPigier,
      maitriseInfo,
      dernierDiplome,
      createdAt: params[9],
      message: "Appel créé ✅",
    });
  } catch (err) {
    console.error("DB INSERT error:", err);
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({ message: "Table 'calls' introuvable." });
    }
    return res.status(500).json({
      message: "Erreur serveur lors de la création",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});

/**

 * Query params optionnels: q, startDate, endDate, filiere, pigier(oui|non),
 *   maitrise(oui|non), page=1, pageSize=20, sort=date_desc|date_asc|created_desc|created_asc
 */

router.get("/", async (req, res) => {
  try {
    const {
      q = "",
      startDate = "",
      endDate = "",
      filiere = "",
      pigier = "",
      maitrise = "",
      page = 1,
      pageSize = 500,
      sort = "date_desc",
    } = req.query;

    const where = [];
    const args = [];

    if (startDate) { where.push("date >= ?"); args.push(startDate); }
    if (endDate)   { where.push("date <= ?"); args.push(endDate); }
    if (filiere)   { where.push("filiere = ?"); args.push(filiere); }
    if (pigier === "oui" || pigier === "non") {
      where.push("dejaPigier = ?");
      args.push(pigier === "oui" ? 1 : 0);
    }
    if (maitrise === "oui" || maitrise === "non") {
      where.push("LOWER(maitriseInfo) = ?");
      args.push(maitrise.toLowerCase());
    }
    if (q) {
      // recherche large (LIKE) — côté SQL (case-insensitive via LOWER)
      where.push(`(
        LOWER(appelant) LIKE ? OR LOWER(appele) LIKE ? OR LOWER(contact) LIKE ? OR
        LOWER(filiere) LIKE ? OR LOWER(dernierDiplome) LIKE ? OR LOWER(maitriseInfo) LIKE ? OR
        date LIKE ? OR heure LIKE ?
      )`);
      const like = `%${norm(q)}%`;
      // NB: pour LIKE sur LOWER(col), on normalise peu côté SQL, on fait simple ici.
      args.push(like, like, like, like, like, like, `%${q}%`, `%${q}%`);
    }


    
    const order = {
      date_desc: "date DESC, heure DESC",
      date_asc: "date ASC, heure ASC",
      created_desc: "createdAt DESC",
      created_asc: "createdAt ASC",
    }[sort] || "date DESC, heure DESC";

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.max(1, Math.min(200, Number(pageSize)));
    const offset = (Math.max(1, Number(page)) - 1) * limit;

    // total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM calls ${whereSql}`,
      args
    );

    // rows
    const [rows] = await pool.query(
      `SELECT * FROM calls ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, 
      [...args, limit, offset]
    );


    res.json({
      total: Number(countRows[0].c || 0),
      page: Number(page),
      pageSize: limit,
      data: rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier })),
    });
  } catch (err) {
    console.error("DB SELECT error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la lecture",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});



//recuper un seul appel par son id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Id invalide" });

    const [rows] = await pool.query(`SELECT * FROM calls WHERE id = ${id}`);
    res.status(200).json(rows || null);
  } catch (err) {
    console.error("DB SELECT error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la lecture",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});




//recuper un seul appel par son id
//modification d'un appel
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id invalide" });

    const {
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere = null,
      dejaPigier = false,
      maitriseInfo = "",
      dernierDiplome = "",
    } = req.body || {};

    if (!date || !heure ||  !appele || !contact) {
      return res.status(400).json({
        message:
          "Champs requis manquants: date, heure,  appele, contact",
      });
    }

    const sql = `
      UPDATE calls
      SET date = ?, heure = ?, appelant = ?, appele = ?, contact = ?,
          filiere = ?, dejaPigier = ?, maitriseInfo = ?, dernierDiplome = ?
      WHERE id = ?
    `;
    const params = [
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere || null,
      dejaPigier ? 1 : 0,
      maitriseInfo || "",
      dernierDiplome || "",
      id,
    ];

    const [result] = await pool.query(sql, params);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Appel introuvable" });
    }

    return res.json({
      id,
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere,
      dejaPigier: !!dejaPigier,
      maitriseInfo,
      dernierDiplome,
      message: "Appel mis à jour ✅",
    });
  } catch (err) {
    console.error("DB UPDATE error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise à jour",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});


router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id invalide" });

    const [result] = await pool.query(`DELETE FROM calls WHERE id = ?`, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Appel introuvable" });
    }

    return res.json({ id, message: "Appel supprimé ✅" });
  } catch (err) {
    console.error("DB DELETE error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});



router.get("/", async (req, res) => {
  try {
    const lim = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));

    // Tu as bien des colonnes séparées: date (DATE) et heure (TIME)
    const sql = `
      SELECT
        id,
        date,
        DATE_FORMAT(heure, '%H:%i') AS heure,   -- HH:mm
        appelant,
        appele,
        contact,
        filiere,
        dejaPigier,
        maitriseInfo,
        dernierDiplome
      FROM calls
      ORDER BY date DESC, heure DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [lim]);
    // normalise le booléen
    const data = rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier }));
    res.json(data);
  } catch (err) {
    console.error("DB SIMPLE SELECT error:", err);
    res.status(500).json({
      message: "Erreur serveur lors de la lecture (simple)",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});

module.exports = router;
