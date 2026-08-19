const express = require("express");

const router = express.Router();

const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage()
});

const {
    getAllNotes,
    getNote,
    createNote,
    updateNote,
    deleteNote,
    uploadImage
} = require("../controllers/notesController");

router.get("/", getAllNotes);
router.get("/:id", getNote);
router.post("/", createNote);
router.put("/:id", updateNote);
router.delete("/:id", deleteNote);
router.post("/:id/image", upload.single("image"), uploadImage);

module.exports = router;