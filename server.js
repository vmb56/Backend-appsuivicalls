// server.js
const express = require("express");
const cors = require("cors");
const { getDb } = require("./db"); // 👈 nouveau
const signupRouter = require("./routes/signup");
const formsRouter = require("./routes/forms");

const app = express();
app.use(cors());
app.use(express.json());

(async () => {
  try {
    const db = await getDb();

    // middleware pour exposer la DB à toutes les routes
    app.use((req, _res, next) => {
      req.db = db;
      next();
    });

    // Routes
    app.use("/signup", signupRouter);
    app.use("/api/forms", formsRouter);
    app.use("/forms", formsRouter);
    app.use("/api/get", formsRouter);
    app.use("/put/update", formsRouter);
    app.use("/api/delete", formsRouter);
    app.use("/api/appels", formsRouter);

    // 404
    app.use((req, res) => res.status(404).json({ message: "Route introuvable" }));

    // Gestion d'erreurs (utile pour catch async)
    app.use((err, _req, res, _next) => {
      console.error("❌ Erreur:", err);
      res.status(500).json({ error: "Erreur serveur", details: err.message });
    });

    const PORT = process.env.PORT || 3000; // 👈 plus 3306
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  } catch (e) {
    console.error("❌ Impossible de démarrer (DB):", e);
    process.exit(1);
  }
})();
