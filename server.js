// server.js
const express = require('express');
const cors = require('cors');
const pool = require('./db');                // 👈 on importe le pool ici aussi
const signupRouter = require('./routes/Signup');
const formsRouter = require('./routes/forms');
const app = express();
app.use(cors());
app.use(express.json());



// Monte le router sur /signup
app.use('/signup', signupRouter);
app.use('/api/forms', formsRouter);
app.use('/forms', formsRouter);
app.use('/api/get', formsRouter);
app.use('/put/update', formsRouter);
app.use('/api/delete', formsRouter);
app.use("/api/appels", formsRouter);

// 404
app.use((req, res) => res.status(404).json({ message: 'Route introuvable' }));

// Start
const PORT = process.env.PORT || 3306;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
