// routes/calls.js
const express = require("express");
const router = express.Router();
const pool = require("../db"); // ✅ le pool est hors du dossier routes

// utilitaire pour normaliser des strings (pour la recherche)
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/* =========================================================
 *  POST /          → créer un appel
 * =======================================================*/
router.post("/", async (req, res) => {
  try {
    const {
      date,
      heure,
      appelant,
      appele,
      contact,
      filiere = null,
      critere = null,       // ✅ NOUVEAU
      dejaPigier = false,
      maitriseInfo = "",
      dernierDiplome = "",
      createdAt, // optionnel
    } = req.body || {};

    // validations minimales
    if (!date || !heure || !appele || !contact) {
      return res.status(400).json({
        message: "Champs requis manquants: date, heure, appele, contact",
      });
    }

    const sql = `
      INSERT INTO calls
        (\`date\`, \`heure\`, \`appelant\`, \`appele\`, \`contact\`,
         \`filiere\`, \`critere\`, \`dejaPigier\`, \`maitriseInfo\`, \`dernierDiplome\`, \`createdAt\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      date,
      heure,
      appelant || null,
      appele,
      contact,
      filiere || null,
      critere || null,
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
      appelant: appelant || null,
      appele,
      contact,
      filiere,
      critere: critere || null,
      dejaPigier: !!dejaPigier,
      maitriseInfo,
      dernierDiplome,
      createdAt: params[10],
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

/* =========================================================
 *  GET /           → liste avec filtres + pagination
 *  Query params:
 *   q, startDate, endDate, filiere, critere(interne|externe),
 *   pigier(oui|non), maitrise(oui|non),
 *   page=1, pageSize=20, sort=date_desc|date_asc|created_desc|created_asc,
 *   all=1 (retourne tout, sans LIMIT/OFFSET)
 * =======================================================*/
router.get("/", async (req, res) => {
  try {
    const {
      q = "",
      startDate = "",
      endDate = "",
      filiere = "",
      critere = "",
      pigier = "",
      maitrise = "",
      page = 1,
      pageSize = 20,
      sort = "date_desc",
      all = "",
    } = req.query;

    const where = [];
    const args = [];

    // Filtres
    if (startDate) { where.push("`date` >= ?"); args.push(startDate); }
    if (endDate)   { where.push("`date` <= ?"); args.push(endDate); }
    if (filiere)   { where.push("`filiere` = ?"); args.push(filiere); }
    if (critere)   { where.push("`critere` = ?"); args.push(critere); }
    if (pigier === "oui" || pigier === "non") {
      where.push("`dejaPigier` = ?");
      args.push(pigier === "oui" ? 1 : 0);
    }
    if (maitrise === "oui" || maitrise === "non") {
      where.push("LOWER(`maitriseInfo`) = ?");
      args.push(maitrise.toLowerCase());
    }
    if (q) {
      where.push(`(
        LOWER(\`appelant\`)       LIKE ? OR
        LOWER(\`appele\`)         LIKE ? OR
        LOWER(\`contact\`)        LIKE ? OR
        LOWER(\`filiere\`)        LIKE ? OR
        LOWER(\`critere\`)        LIKE ? OR
        LOWER(\`dernierDiplome\`) LIKE ? OR
        LOWER(\`maitriseInfo\`)   LIKE ? OR
        \`date\` LIKE ? OR \`heure\` LIKE ?
      )`);
      const like = `%${norm(q)}%`;
      args.push(like, like, like, like, like, like, like, `%${q}%`, `%${q}%`);
    }

    // Tri
    const order = {
      date_desc:    "`date` DESC, `heure` DESC",
      date_asc:     "`date` ASC,  `heure` ASC",
      created_desc: "`createdAt` DESC",
      created_asc:  "`createdAt` ASC",
    }[sort] || "`date` DESC, `heure` DESC";

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // total filtré
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM calls ${whereSql}`,
      args
    );
    const total = Number(countRows?.[0]?.c || 0);

    // total BD
    const [countAllRows] = await pool.query(`SELECT COUNT(*) AS c FROM calls`);
    const totalAll = Number(countAllRows?.[0]?.c || 0);

    // all=1 → pas de limit/offset
    const returnAll = all === "1" || all === "true";

    let rowsSql = `
      SELECT
        \`id\`,
        \`date\`,
        DATE_FORMAT(\`heure\`, '%H:%i') AS heure,  -- HH:mm
        \`appelant\`,
        \`appele\`,
        \`contact\`,
        \`filiere\`,
        \`critere\`,
        \`dejaPigier\`,
        \`maitriseInfo\`,
        \`dernierDiplome\`,
        \`createdAt\`
      FROM calls
      ${whereSql}
      ORDER BY ${order}
    `;
    const rowsArgs = [...args];

    if (!returnAll) {
      const limit = Math.max(1, Math.min(200, Number(pageSize)));
      const offset = (Math.max(1, Number(page)) - 1) * limit;
      rowsSql += ` LIMIT ? OFFSET ?`;
      rowsArgs.push(limit, offset);

      const [rows] = await pool.query(rowsSql, rowsArgs);
      return res.json({
        total,
        totalAll,
        page: Number(page),
        pageSize: limit,
        returned: rows.length,
        data: rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier })),
      });
    } else {
      const [rows] = await pool.query(rowsSql, rowsArgs);
      return res.json({
        total,
        totalAll,
        page: null,
        pageSize: null,
        returned: rows.length,
        data: rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier })),
      });
    }
  } catch (err) {
    console.error("DB SELECT error:", err);
    res.status(500).json({
      message: "Erreur serveur lors de la lecture",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});

/* =========================================================
 *  GET /simple     → liste simple (limite), SANS filtres
 * =======================================================*/
router.get("/simple", async (req, res) => {
  try {
    const lim = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));

    const sql = `
      SELECT
        \`id\`,
        \`date\`,
        DATE_FORMAT(\`heure\`, '%H:%i') AS heure,   -- HH:mm
        \`appelant\`,
        \`appele\`,
        \`contact\`,
        \`filiere\`,
        \`critere\`,
        \`dejaPigier\`,
        \`maitriseInfo\`,
        \`dernierDiplome\`
      FROM calls
      ORDER BY \`date\` DESC, \`heure\` DESC
      LIMIT ?
    `;

    const [rows] = await pool.query(sql, [lim]);
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

/* =========================================================
 *  GET /:id        → récupérer un appel par id
 * =======================================================*/
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id invalide" });

    const [rows] = await pool.query(
      `SELECT \`id\`, \`date\`, DATE_FORMAT(\`heure\`, '%H:%i') AS heure,
              \`appelant\`, \`appele\`, \`contact\`, \`filiere\`, \`critere\`,
              \`dejaPigier\`, \`maitriseInfo\`, \`dernierDiplome\`, \`createdAt\`
       FROM calls WHERE \`id\` = ?`,
      [id]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ message: "Appel introuvable" });
    row.dejaPigier = !!row.dejaPigier;
    res.status(200).json(row);
  } catch (err) {
    console.error("DB SELECT error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la lecture",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});

/* =========================================================
 *  PUT /:id        → modifier un appel
 * =======================================================*/
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
      critere = null,
      dejaPigier = false,
      maitriseInfo = "",
      dernierDiplome = "",
    } = req.body || {};

    if (!date || !heure || !appele || !contact) {
      return res.status(400).json({
        message: "Champs requis manquants: date, heure, appele, contact",
      });
    }

    const sql = `
      UPDATE calls
      SET \`date\` = ?, \`heure\` = ?, \`appelant\` = ?, \`appele\` = ?, \`contact\` = ?,
          \`filiere\` = ?, \`critere\` = ?, \`dejaPigier\` = ?, \`maitriseInfo\` = ?, \`dernierDiplome\` = ?
      WHERE \`id\` = ?
    `;
    const params = [
      date,
      heure,
      appelant || null,
      appele,
      contact,
      filiere || null,
      critere || null,
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
      appelant: appelant || null,
      appele,
      contact,
      filiere,
      critere: critere || null,
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

/* =========================================================
 *  DELETE /:id     → supprimer un appel
 * =======================================================*/
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Id invalide" });

    const [result] = await pool.query(`DELETE FROM calls WHERE \`id\` = ?`, [id]);
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

module.exports = router;
