// routes/calls.js (version Turso / libSQL)
const express = require("express");
const router = express.Router();

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
      critere = null,
      dejaPigier = false,
      maitriseInfo = "",
      dernierDiplome = "",
      createdAt, // optionnel
    } = req.body || {};

    if (!date || !heure || !appele || !contact) {
      return res.status(400).json({
        message: "Champs requis manquants: date, heure, appele, contact",
      });
    }

    const sql = `
      INSERT INTO calls
        ("date","heure","appelant","appele","contact",
         "filiere","critere","dejaPigier","maitriseInfo","dernierDiplome","createdAt")
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

    const r = await req.db.execute({ sql, args: params });

    return res.status(201).json({
      id: Number(r.lastInsertRowid ?? 0),
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
    return res.status(500).json({
      message: "Erreur serveur lors de la création",
      detail: err.message,
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
    if (startDate) { where.push(`"date" >= ?`); args.push(startDate); }
    if (endDate)   { where.push(`"date" <= ?`); args.push(endDate); }
    if (filiere)   { where.push(`"filiere" = ?`); args.push(filiere); }
    if (critere)   { where.push(`"critere" = ?`); args.push(critere); }
    if (pigier === "oui" || pigier === "non") {
      where.push(`"dejaPigier" = ?`);
      args.push(pigier === "oui" ? 1 : 0);
    }
    if (maitrise === "oui" || maitrise === "non") {
      // égalité stricte, déjà en lower côté param
      where.push(`LOWER("maitriseInfo") = ?`);
      args.push(maitrise.toLowerCase());
    }
    if (q) {
      where.push(`(
        LOWER("appelant")       LIKE ? OR
        LOWER("appele")         LIKE ? OR
        LOWER("contact")        LIKE ? OR
        LOWER("filiere")        LIKE ? OR
        LOWER("critere")        LIKE ? OR
        LOWER("dernierDiplome") LIKE ? OR
        LOWER("maitriseInfo")   LIKE ? OR
        "date" LIKE ? OR "heure" LIKE ?
      )`);
      const like = `%${norm(q)}%`;
      // NB: on ne normalise pas les colonnes (SQLite n'a pas l'accent-folding built-in)
      args.push(like, like, like, like, like, like, like, `%${q}%`, `%${q}%`);
    }

    // Tri
    const order = {
      date_desc:    `"date" DESC, "heure" DESC`,
      date_asc:     `"date" ASC,  "heure" ASC`,
      created_desc: `"createdAt" DESC`,
      created_asc:  `"createdAt" ASC`,
    }[sort] || `"date" DESC, "heure" DESC`;

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // total filtré
    const countR = await req.db.execute({ sql: `SELECT COUNT(*) AS c FROM calls ${whereSql}`, args });
    const total = Number(countR.rows?.[0]?.c ?? 0);

    // total BD
    const countAllR = await req.db.execute(`SELECT COUNT(*) AS c FROM calls`);
    const totalAll = Number(countAllR.rows?.[0]?.c ?? 0);

    const returnAll = all === "1" || all === "true";

    let rowsSql = `
      SELECT
        "id",
        "date",
        substr("heure",1,5) AS heure, -- HH:mm
        "appelant",
        "appele",
        "contact",
        "filiere",
        "critere",
        "dejaPigier",
        "maitriseInfo",
        "dernierDiplome",
        "createdAt"
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

      const r = await req.db.execute({ sql: rowsSql, args: rowsArgs });
      const rows = r.rows || [];
      return res.json({
        total,
        totalAll,
        page: Number(page),
        pageSize: limit,
        returned: rows.length,
        data: rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier })),
      });
    } else {
      const r = await req.db.execute({ sql: rowsSql, args: rowsArgs });
      const rows = r.rows || [];
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
      detail: err.message,
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
        "id",
        "date",
        substr("heure",1,5) AS heure,   -- HH:mm
        "appelant",
        "appele",
        "contact",
        "filiere",
        "critere",
        "dejaPigier",
        "maitriseInfo",
        "dernierDiplome"
      FROM calls
      ORDER BY "date" DESC, "heure" DESC
      LIMIT ?
    `;

    const r = await req.db.execute({ sql, args: [lim] });
    const rows = r.rows || [];
    const data = rows.map(r => ({ ...r, dejaPigier: !!r.dejaPigier }));
    res.json(data);
  } catch (err) {
    console.error("DB SIMPLE SELECT error:", err);
    res.status(500).json({
      message: "Erreur serveur lors de la lecture (simple)",
      detail: err.message,
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

    const r = await req.db.execute({
      sql: `
        SELECT "id","date",substr("heure",1,5) AS heure,
               "appelant","appele","contact","filiere","critere",
               "dejaPigier","maitriseInfo","dernierDiplome","createdAt"
        FROM calls WHERE "id" = ?
      `,
      args: [id],
    });

    const row = r.rows?.[0];
    if (!row) return res.status(404).json({ message: "Appel introuvable" });
    row.dejaPigier = !!row.dejaPigier;
    res.status(200).json(row);
  } catch (err) {
    console.error("DB SELECT error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la lecture",
      detail: err.message,
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
      SET "date" = ?, "heure" = ?, "appelant" = ?, "appele" = ?, "contact" = ?,
          "filiere" = ?, "critere" = ?, "dejaPigier" = ?, "maitriseInfo" = ?, "dernierDiplome" = ?
      WHERE "id" = ?
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

    const r = await req.db.execute({ sql, args: params });
    if ((r.rowsAffected ?? 0) === 0) {
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
      detail: err.message,
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

    const r = await req.db.execute({
      sql: `DELETE FROM calls WHERE "id" = ?`,
      args: [id],
    });

    if ((r.rowsAffected ?? 0) === 0) {
      return res.status(404).json({ message: "Appel introuvable" });
    }

    return res.json({ id, message: "Appel supprimé ✅" });
  } catch (err) {
    console.error("DB DELETE error:", err);
    return res.status(500).json({
      message: "Erreur serveur lors de la suppression",
      detail: err.message,
    });
  }
});

module.exports = router;
