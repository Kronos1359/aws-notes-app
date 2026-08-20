const express = require("express");

const notesRoutes = require("./routes/notes");
const authenticate = require("./middleware/auth");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Notes API is running"
    });
});

app.use("/notes", authenticate, notesRoutes);

module.exports = app;