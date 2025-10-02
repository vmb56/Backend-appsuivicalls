// Routes/Signup.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // 👈 on récupère le pool
router.post('/', async (req, res) => {
  try {
    // On supporte { Nom, Email, Password } OU { name, email, password } OU { nom }
    const Nom = req.body.Nom ?? req.body.name ?? req.body.nom;
    const Email = req.body.Email ?? req.body.email;
    const Password = req.body.Password ?? req.body.password;

    if (!Nom || !Email || !Password) {
      return res.status(400).json({
        message:
          "Champs requis manquants. Il faut Nom (ou name/nom), Email et Password (ou password).",
        body: req.body,
      });
    }

    // 🔍 Vérifier si déjà existant (Nom + Email)
    const checkSql = 'SELECT * FROM `login` WHERE `Nom` = ? AND `Email` = ?';
    const [rows] = await pool.query(checkSql, [Nom, Email]);

    if (rows.length > 0) {
      return res.status(409).json({
        message: 'Un utilisateur avec ce Nom et cet Email existe déjà ❌',
      });
    }

    // 💾 Si pas trouvé → insertion
    const sql = 'INSERT INTO `login` (`Nom`, `Email`, `Password`) VALUES (?, ?, ?)';
    const params = [Nom, Email, Password];

    const [result] = await pool.query(sql, params);

    return res.status(201).json({
      Id: result.insertId,
      Nom,
      Email,
      message: 'Utilisateur créé ✅',
    });
  } catch (err) {
    console.error('DB INSERT error:', {
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
      message: err.message,
    });

    if (err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ message: "Table 'login' introuvable dans la base 'Signup'." });
    }
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({ message: "Colonne inconnue. Attendu: Id, Nom, Email, Password." });
    }
    
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Email déjà utilisé.' });
    }

    return res.status(500).json({
      message: 'Erreur serveur lors de la création',
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }
});



module.exports = router;
