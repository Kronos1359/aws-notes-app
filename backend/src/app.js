const express = require("express");

const notesRoutes = require("./routes/notes");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Notes API is running"
    });
});

app.use("/notes", notesRoutes);

module.exports = app;