const express = require("express");
const cors = require("cors");

const notesRoutes = require("./routes/notes");
const authenticate = require("./middleware/auth");

const app = express();

app.use(
    cors({
        origin: [
            "http://localhost:5173",
            "https://d84l1y8p4kdic.cloudfront.net"
        ],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    })
);

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        message: "Notes API is running"
    });
});

app.use("/notes", authenticate, notesRoutes);

module.exports = app;